import { defineConfig } from "vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

export default defineConfig({
  plugins: [wgslVitePlugin()],
  // Publié sous https://nh.thomasmaury.fr/cinerae/ : tous les chemins du build sont relatifs à ce sous-dossier.
  base: "/cinerae/",
  server: { port: 5183 },
  // public/models (labo vision, ~320 Mo) n'est pas livré : le moteur ne s'en sert pas, le dev le sert toujours.
  build: { copyPublicDir: false },
});
