import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { ChecksumException, DecodeHintType, FormatException, NotFoundException } from "@zxing/library";
import type { CameraDecoderAdapter, CameraDecoderSession, CameraDiagnostic, CameraFailure } from "./camera-adapter";
import { stopCameraResources } from "./camera-lifecycle";

export const MARIPOSA_BARCODE_FORMATS = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE] as const;
export const MARIPOSA_BARCODE_FORMAT_NAMES = ["CODE_128", "CODE_39", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "QR_CODE"] as const;
export const MARIPOSA_CAMERA_CONSTRAINTS: MediaStreamConstraints = { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } } };

function cameraFailure(error: unknown): Error & { cameraFailure: CameraFailure } {
  const name = error instanceof DOMException ? error.name : "";
  const failure: CameraFailure = name === "NotAllowedError" || name === "SecurityError" ? "PERMISSION_DENIED" : !navigator.mediaDevices?.getUserMedia ? "UNSUPPORTED" : "UNAVAILABLE";
  return Object.assign(new Error(failure), { cameraFailure: failure });
}

export class ZxingCameraDecoderAdapter implements CameraDecoderAdapter {
  async start(video: HTMLVideoElement, onDecode: (identifier: string) => void, onDiagnostic?: (diagnostic: CameraDiagnostic) => void): Promise<CameraDecoderSession> {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw cameraFailure(new DOMException("Unsupported", "NotSupportedError"));
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [...MARIPOSA_BARCODE_FORMATS]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 900 });
    let lastState: CameraDiagnostic["lastDecodeState"] = "WAITING", lastReportAt = 0;
    const report = (force=false) => { const now=Date.now();if(!force&&now-lastReportAt<750)return;lastReportAt=now;const track=(video.srcObject as MediaStream|null)?.getVideoTracks()[0];onDiagnostic?.({decoder:"BrowserMultiFormatReader",formats:[...MARIPOSA_BARCODE_FORMAT_NAMES],videoWidth:video.videoWidth,videoHeight:video.videoHeight,cameraLabel:track?.label||null,lastDecodeState:lastState}) };
    let controls: IScannerControls;
    try {
      controls = await reader.decodeFromConstraints(MARIPOSA_CAMERA_CONSTRAINTS, video, (result,error) => {
        const value = result?.getText().trim();
        if (value) { lastState="DECODED";report(true);onDecode(value);return; }
        lastState=error instanceof NotFoundException?"NOT_FOUND":error instanceof FormatException?"FORMAT":error instanceof ChecksumException?"CHECKSUM":error?"ERROR":"WAITING";report();
      });
      video.addEventListener("loadedmetadata",()=>report(true),{once:true});report(true);
    } catch (error) {
      stopCameraResources(video);
      throw cameraFailure(error);
    }
    let stopped = false;
    return { stop() { if (stopped) return; stopped = true; stopCameraResources(video, controls); } };
  }
}

export function createCameraDecoderAdapter(): CameraDecoderAdapter { return new ZxingCameraDecoderAdapter(); }
