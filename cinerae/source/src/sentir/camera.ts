// ?cam=<morceau du nom> choisit la caméra (utile quand la machine en a plusieurs :
// NDI, OBS, NVIDIA Broadcast… — sans ce choix Chrome prend la première, qui peut
// expirer). Les noms ne sont lisibles qu'une fois la permission accordée.
export async function startCamera(): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const voulu = new URLSearchParams(location.search).get("cam");
  let deviceId: string | undefined;
  if (voulu) {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    deviceId = cams.find((d) => d.label.toLowerCase().includes(voulu.toLowerCase()))?.deviceId;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return video;
}
