export type CameraFailure = "PERMISSION_DENIED" | "UNSUPPORTED" | "UNAVAILABLE";
export type CameraDecoderSession = { stop(): void };
export type CameraDiagnostic = { decoder: string; formats: string[]; videoWidth: number; videoHeight: number; cameraLabel: string | null; lastDecodeState: "WAITING" | "NOT_FOUND" | "FORMAT" | "CHECKSUM" | "ERROR" | "DECODED" };
export interface CameraDecoderAdapter {
  start(video: HTMLVideoElement, onDecode: (identifier: string) => void, onDiagnostic?: (diagnostic: CameraDiagnostic) => void): Promise<CameraDecoderSession>;
}
