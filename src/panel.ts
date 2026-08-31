// Minimal on-screen control panel + FPS counter, styled to disappear into
// the instrument. No dependency: a handful of range inputs and a select.

export interface PanelBindings {
  force: number;
  viscosity: number;
  turbulence: number;
  silenceThreshold: number;
  particleCount: number;
}

export interface PanelCallbacks {
  onChange(values: PanelBindings): void;
}

const QUALITIES: { label: string; count: number }[] = [
  { label: "Basse — 50 k", count: 50_000 },
  { label: "Moyenne — 120 k", count: 120_000 },
  { label: "Haute — 200 k", count: 200_000 },
  { label: "Ultra — 400 k", count: 400_000 },
];

export function createPanel(
  root: HTMLElement,
  initial: PanelBindings,
  callbacks: PanelCallbacks
) {
  const values = { ...initial };
  const panel = document.createElement("div");
  panel.className = "cinerae-panel";
  root.appendChild(panel);

  const fpsLine = document.createElement("div");
  fpsLine.className = "cinerae-fps";
  fpsLine.textContent = "— fps";
  panel.appendChild(fpsLine);

  const statusLine = document.createElement("div");
  statusLine.className = "cinerae-status";
  statusLine.textContent = "en attente d'activation";
  panel.appendChild(statusLine);

  const crystalBar = document.createElement("div");
  crystalBar.className = "cinerae-crystal";
  crystalBar.innerHTML = `<span class="cinerae-crystal-label">cristal</span><span class="cinerae-crystal-track"><span class="cinerae-crystal-fill"></span></span>`;
  panel.appendChild(crystalBar);
  const crystalFill = crystalBar.querySelector(
    ".cinerae-crystal-fill"
  ) as HTMLElement;

  const emit = () => callbacks.onChange({ ...values });

  const slider = (
    label: string,
    key: keyof Omit<PanelBindings, "particleCount">,
    min: number,
    max: number,
    step: number
  ) => {
    const row = document.createElement("label");
    row.className = "cinerae-row";
    const readout = document.createElement("span");
    readout.className = "cinerae-value";
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(values[key]);
    const show = () => (readout.textContent = Number(input.value).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
    show();
    input.addEventListener("input", () => {
      values[key] = Number(input.value);
      show();
      emit();
    });
    row.append(name, input, readout);
    panel.appendChild(row);
  };

  slider("force", "force", 0, 3, 0.05);
  slider("viscosité", "viscosity", 0, 8, 0.1);
  slider("turbulence", "turbulence", 0, 2, 0.05);
  slider("seuil de cristallisation", "silenceThreshold", 0.001, 0.15, 0.001);

  const qualityRow = document.createElement("label");
  qualityRow.className = "cinerae-row";
  const qualityName = document.createElement("span");
  qualityName.textContent = "particules";
  const select = document.createElement("select");
  for (const q of QUALITIES) {
    const option = document.createElement("option");
    option.value = String(q.count);
    option.textContent = q.label;
    if (q.count === values.particleCount) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    values.particleCount = Number(select.value);
    emit();
  });
  qualityRow.append(qualityName, select);
  panel.appendChild(qualityRow);

  return {
    setFps(fps: number) {
      fpsLine.textContent = `${Math.round(fps)} fps`;
    },
    setStatus(text: string) {
      statusLine.textContent = text;
    },
    setCrystal(value: number) {
      crystalFill.style.width = `${Math.round(value * 100)}%`;
    },
  };
}
