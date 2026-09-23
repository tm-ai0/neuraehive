import { AutoModel, AutoImageProcessor, env, RawImage, Tensor } from "@huggingface/transformers";
import { Meter, clamp01 } from "./meter";
import type { PoseEngine } from "./pose";

// Tout local : modèle dans public/models, runtime onnx dans public/models/ort.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
// URL absolu : le helper d'import de Vite laisse passer les URL complètes,
// un chemin /models/... se fait réécrire en ?import et refuser (dossier public).
(env.backends.onnx as { wasm?: { wasmPaths?: string } }).wasm ??= {};
(env.backends.onnx as { wasm: { wasmPaths?: string } }).wasm.wasmPaths = `${location.origin}/models/ort/`;

const SEUIL_SATURATION_MS = 650; // au-delà, le GPU sature : repli imité (v3 fp32 vit à ~400 ms ici)
const SEUIL_RETOUR_MS = 550;
const PROBE_INTERVALLE_MS = 12000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ModeProfondeur = "arrêt" | "chargement" | "onnx" | "imitée";

export class DepthEngine {
  meter = new Meter();
  mode: ModeProfondeur = "arrêt";
  proche = 0;
  erreur: string | null = null;
  outCanvas = document.createElement("canvas");
  // DA3 attend un rang 5 (lot, vues, canaux, H, L) : le pipeline tout fait de
  // transformers.js envoie du rang 4 — on descend d'un cran, processeur + modèle,
  // et on ajoute la dimension vues à la main.
  private modele: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;
  private processeur: Awaited<ReturnType<typeof AutoImageProcessor.from_pretrained>> | null = null;
  private actif = false;
  private inCanvas = document.createElement("canvas");
  private mesures = 0;
  private prochainProbe = 0;
  private brutMin = Infinity; // étalonnage lent de « proche » sur les valeurs brutes
  private brutMax = -Infinity;

  precision: string | null = null;
  private vues = true; // DA3 attend une dimension vues (rang 5), DA2 non
  private inverse = true; // DA3 sort une PROFONDEUR (loin = grand) ; DA2 une disparité (près = grand)

  // Choix étagé MESURÉ, du plus conforme au brief vers ce qui tient :
  // V3 8 bits d'abord — mesuré ici, ses opérateurs int8 retombent sur le CPU
  // (0,8-8 s), il rate le seuil mais n'abîme rien. V3 fp16 est ABSENT de la
  // liste : son shader ResizeBiCubic ne compile pas (bug onnxruntime-web
  // 1.26-dev) et l'erreur empoisonne le device WebGPU partagé — tout essai
  // suivant dans la même page échoue à tort. V3 fp32 tient (389 ms mesuré),
  // V2 fp16 aussi (277 ms). Le gagnant est mémorisé (localStorage) pour ne
  // pas re-payer l'essai à chaque activation.
  private static TIERS = [
    { repo: "depth-anything-v3-small", dtype: "q8", vues: true, ext: false, inverse: true },
    { repo: "depth-anything-v3-small", dtype: "fp32", vues: true, ext: true, inverse: true },
    { repo: "depth-anything-v2-small", dtype: "fp16", vues: false, ext: false, inverse: false },
    { repo: "depth-anything-v2-small", dtype: "q8", vues: false, ext: false, inverse: false },
  ] as const;

  async start(video: HTMLVideoElement, pose: PoseEngine): Promise<void> {
    if (this.actif) return;
    this.actif = true;
    this.mode = "chargement";
    if (!this.modele && !this.erreur) {
      try {
        // Le tier connu passe en tête ; s'il échoue on continue la liste.
        const connu = localStorage.getItem("sentir-profondeur-tier");
        const ordre = [...DepthEngine.TIERS].sort(
          (a, b) => Number(`${b.repo}:${b.dtype}` === connu) - Number(`${a.repo}:${a.dtype}` === connu),
        );
        for (const tier of ordre) {
          try {
            this.processeur = await AutoImageProcessor.from_pretrained(tier.repo);
            this.vues = tier.vues;
            this.inverse = tier.inverse;
            const modele = await AutoModel.from_pretrained(tier.repo, {
              device: "webgpu",
              dtype: tier.dtype,
              use_external_data_format: tier.ext,
            });
            this.modele = modele;
            await this.inferer(video); // échauffement (compilation des shaders)
            const t = performance.now();
            await this.inferer(video);
            const lat = performance.now() - t;
            if (lat <= SEUIL_SATURATION_MS) {
              this.precision = `${tier.repo.includes("v3") ? "v3" : "v2"} ${tier.dtype}`;
              localStorage.setItem("sentir-profondeur-tier", `${tier.repo}:${tier.dtype}`);
              break;
            }
            console.warn(`[sentir] profondeur ${tier.repo} ${tier.dtype} trop lente (${Math.round(lat)} ms), on essaie la suivante`);
          } catch (e) {
            console.warn(`[sentir] profondeur ${tier.repo} ${tier.dtype} en échec, on essaie la suivante :`, e);
          }
          await (this.modele as unknown as { dispose?: () => Promise<void> } | null)?.dispose?.();
          this.modele = null;
        }
      } catch (e) {
        this.erreur = String(e);
        console.warn("[sentir] profondeur onnx indisponible, repli imité :", e);
      }
    }
    this.mode = this.modele ? "onnx" : "imitée";
    this.mesures = 0;
    this.meter.reset();
    void this.boucle(video, pose);
  }

  stop(): void {
    this.actif = false;
    this.mode = "arrêt";
  }

  private async boucle(video: HTMLVideoElement, pose: PoseEngine): Promise<void> {
    while (this.actif) {
      const t0 = performance.now();
      if (this.mode === "onnx" && this.modele) {
        try {
          await this.inferer(video);
        } catch (e) {
          this.erreur = String(e);
          this.mode = "imitée";
          console.warn("[sentir] inférence profondeur en échec, repli imité :", e);
        }
        const lat = performance.now() - t0;
        this.mesures++;
        if (this.mesures === 1) {
          // Premier tour = échauffement (compilation des shaders) : pas de mesure.
          this.meter.reset();
          continue;
        }
        this.meter.tick(lat, performance.now());
        if (this.mesures >= 4 && this.meter.ms > SEUIL_SATURATION_MS) {
          this.mode = "imitée";
          this.prochainProbe = performance.now() + PROBE_INTERVALLE_MS;
        }
        // Cadence lissée : on vise ~1,6 × la latence, bornée, jamais dos à dos.
        const cible = Math.min(1200, Math.max(120, this.meter.ms * 1.6));
        await sleep(Math.max(40, cible - lat));
      } else if (this.mode === "imitée") {
        this.imiter(pose);
        this.meter.tick(performance.now() - t0, performance.now());
        // Le GPU respire à nouveau ? Une sonde de temps en temps.
        if (this.modele && performance.now() > this.prochainProbe) {
          this.prochainProbe = performance.now() + PROBE_INTERVALLE_MS;
          const p0 = performance.now();
          try {
            await this.inferer(video);
            const lat = performance.now() - p0;
            if (lat < SEUIL_RETOUR_MS) {
              this.mode = "onnx";
              this.mesures = 0;
              this.meter.reset();
              continue;
            }
          } catch {
            /* on reste en imité */
          }
        }
        await sleep(100);
      } else {
        await sleep(100);
      }
    }
  }

  private async inferer(video: HTMLVideoElement): Promise<void> {
    const iw = 322;
    const ih = Math.round((iw * video.videoHeight) / Math.max(1, video.videoWidth));
    if (this.inCanvas.width !== iw || this.inCanvas.height !== ih) {
      this.inCanvas.width = iw;
      this.inCanvas.height = ih;
    }
    this.inCanvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0, iw, ih);
    const entree = await this.processeur!(RawImage.fromCanvas(this.inCanvas));
    const pixel_values = (entree as { pixel_values: Tensor }).pixel_values;
    const sortie = await this.modele!({ pixel_values: this.vues ? pixel_values.unsqueeze(1) : pixel_values });
    const tenseur = Object.values(sortie as Record<string, Tensor>)[0];
    const dims = tenseur.dims;
    const height = dims[dims.length - 2];
    const width = dims[dims.length - 1];
    const data = tenseur.data as Float32Array;
    const n = width * height;
    if (this.outCanvas.width !== width || this.outCanvas.height !== height) {
      this.outCanvas.width = width;
      this.outCanvas.height = height;
    }
    // Normalisation min-max de la frame pour l'affichage ; « proche » = p90 des
    // valeurs brutes, étalonné sur les bornes lentes vues depuis le début.
    // Tout est ramené en « proximité » (près = grand) : V3 livre une profondeur
    // (mesuré sur capture : la personne sortait sombre), on la retourne.
    const signe = this.inverse ? -1 : 1;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = signe * data[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    this.brutMin = Math.min(this.brutMin, mn);
    this.brutMax = Math.max(this.brutMax, mx);
    const plage = mx - mn || 1;
    const img = new ImageData(width, height);
    const px = img.data;
    const histo = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(255, (((signe * data[i] - mn) / plage) * 255) | 0));
      histo[v]++;
      const o = i * 4;
      px[o] = v;
      px[o + 1] = (v * 0.86) | 0;
      px[o + 2] = (v * 0.62) | 0;
      px[o + 3] = 255;
    }
    let reste = Math.max(1, (n * 0.1) | 0);
    let p90 = 255;
    for (; p90 > 0 && reste > 0; p90--) reste -= histo[p90];
    // p90 de la frame remis dans l'échelle brute, puis dans les bornes lentes.
    const brutP90 = mn + (p90 / 255) * plage;
    const plageLente = this.brutMax - this.brutMin || 1;
    this.proche = clamp01((brutP90 - this.brutMin) / plageLente);
    this.outCanvas.getContext("2d")!.putImageData(img, 0, 0);
  }

  // Repli : taille de la silhouette + parallaxe du flux (vitesse du centre).
  private imiter(pose: PoseEngine): void {
    const taille = clamp01((pose.boiteHauteur - 0.2) / 0.7);
    const parallaxe = clamp01(Math.abs(pose.vitesseX) / 0.8);
    this.proche = clamp01(taille * 0.8 + parallaxe * 0.2);
    const w = 160, h = 120;
    if (this.outCanvas.width !== w || this.outCanvas.height !== h) {
      this.outCanvas.width = w;
      this.outCanvas.height = h;
    }
    const ctx = this.outCanvas.getContext("2d")!;
    ctx.fillStyle = "#0a0908";
    ctx.fillRect(0, 0, w, h);
    if (pose.maskBitmap) {
      const lum = 40 + this.proche * 215;
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = `brightness(${Math.round((lum / 255) * 100 + 30)}%)`;
      ctx.drawImage(pose.maskBitmap, 0, 0, w, h);
      ctx.filter = "none";
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    if (this.outCanvas.width === 0) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(this.outCanvas, -w, 0, w, h);
    ctx.restore();
  }
}
