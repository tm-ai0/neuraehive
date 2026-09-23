import { FilesetResolver } from "@mediapipe/tasks-vision";

// Un seul chargement du wasm MediaPipe pour les trois tâches, servi en local.
let promesse: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

export function visionFileset() {
  if (!promesse) promesse = FilesetResolver.forVisionTasks("/models/wasm");
  return promesse;
}
