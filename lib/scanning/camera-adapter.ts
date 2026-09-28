export type CameraFailure = "PERMISSION_DENIED" | "UNSUPPORTED" | "UNAVAILABLE";
export type CameraDecoderSession = { stop(): void };
export interface CameraDecoderAdapter {
  start(video: HTMLVideoElement, onDecode: (identifier: string) => void): Promise<CameraDecoderSession>;
}

