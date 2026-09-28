export type StoppableScanner = { stop(): void };
type VideoWithStream = { srcObject: MediaProvider | null };

export function stopCameraResources(video: VideoWithStream, controls?: StoppableScanner | null) {
  controls?.stop();
  const stream = video.srcObject;
  if (stream && "getTracks" in stream && typeof stream.getTracks === "function") stream.getTracks().forEach(track => track.stop());
  video.srcObject = null;
}

