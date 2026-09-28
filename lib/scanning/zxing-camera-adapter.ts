import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import type { CameraDecoderAdapter, CameraDecoderSession, CameraFailure } from "./camera-adapter";
import { stopCameraResources } from "./camera-lifecycle";

export const MARIPOSA_BARCODE_FORMATS = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE] as const;

function cameraFailure(error: unknown): Error & { cameraFailure: CameraFailure } {
  const name = error instanceof DOMException ? error.name : "";
  const failure: CameraFailure = name === "NotAllowedError" || name === "SecurityError" ? "PERMISSION_DENIED" : !navigator.mediaDevices?.getUserMedia ? "UNSUPPORTED" : "UNAVAILABLE";
  return Object.assign(new Error(failure), { cameraFailure: failure });
}

export class ZxingCameraDecoderAdapter implements CameraDecoderAdapter {
  async start(video: HTMLVideoElement, onDecode: (identifier: string) => void): Promise<CameraDecoderSession> {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw cameraFailure(new DOMException("Unsupported", "NotSupportedError"));
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 220, delayBetweenScanSuccess: 900 });
    reader.possibleFormats = [...MARIPOSA_BARCODE_FORMATS];
    let controls: IScannerControls;
    try {
      controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, video, result => {
        const value = result?.getText().trim();
        if (value) onDecode(value);
      });
    } catch (error) {
      stopCameraResources(video);
      throw cameraFailure(error);
    }
    let stopped = false;
    return { stop() { if (stopped) return; stopped = true; stopCameraResources(video, controls); } };
  }
}

export function createCameraDecoderAdapter(): CameraDecoderAdapter { return new ZxingCameraDecoderAdapter(); }
