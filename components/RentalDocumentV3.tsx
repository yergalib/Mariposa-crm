import type { RentalSnapshot } from "@/lib/orders/document-snapshot";
import { RentalDocumentV2 } from "./RentalDocumentV2";
export function RentalDocumentV3({ snapshot, version, reason }: { snapshot: Extract<RentalSnapshot, { templateVersion: 3 }>; version: number; reason: string | null }) {
  const legacy = { ...snapshot, schemaVersion: 2 as const, templateVersion: 2 as const };
  return <><RentalDocumentV2 snapshot={legacy} version={version} reason={reason}/><section className="document-information"><h2>Информационный текст</h2><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{snapshot.textBlock.renderedText}</p><small>Текст зафиксирован в этой версии документа. Документ не подписан.</small></section></>;
}
