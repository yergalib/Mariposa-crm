import type { RentalSnapshot } from "@/lib/orders/document-snapshot";
import { RentalDocumentV1 } from "./RentalDocumentV1";
export function RentalDocumentV2({ snapshot, version, reason }: { snapshot: Extract<RentalSnapshot, { templateVersion: 2 }>; version: number; reason: string | null }) {
  return <><section className="document-issuer"><strong>{snapshot.issuer.organizationName}</strong>{snapshot.issuer.address && <p>Адрес филиала: {snapshot.issuer.address}</p>}{snapshot.issuer.phone && <p>Телефон филиала: {snapshot.issuer.phone}</p>}</section><RentalDocumentV1 snapshot={snapshot} version={version} reason={reason}/></>;
}
