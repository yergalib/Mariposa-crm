import "server-only";
import type { Prisma } from "@/generated/prisma/client";

const SAFE_KEYS = new Set(["kind","amountMinor","currency","paymentMethodCode","sourceType","relatedTransactionId","allocationId","productInstanceId","reason","supplierId","purchaseId","purchaseNumber","purchaseItemId","receiptId","receiptNumber","branchId","itemCount","quantity","trackingMode","status","additionalCostMinor","totalMinor"]);
const FORBIDDEN = /password|hash|token|secret|credential|cookie|authorization/i;
type AuditValue = string | number | boolean | null;

export function sanitizeAuditMetadata(input?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (!input) return undefined;
  const safe: Record<string, AuditValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_KEYS.has(key) || FORBIDDEN.test(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") safe[key] = value;
    else if (typeof value === "string") safe[key] = value.slice(0, 300);
  }
  const encoded = JSON.stringify(safe);
  if (Buffer.byteLength(encoded, "utf8") > 4096) throw new Error("Audit metadata is too large.");
  return safe;
}

export async function appendAuditLog(tx: Prisma.TransactionClient, input: {
  organizationId: string; branchId?: string | null; actorUserId?: string | null;
  actorMembershipId?: string | null; action: string; entityType: string; entityId?: string | null;
  result?: "SUCCESS" | "DENIED" | "FAILED"; source?: "CRM" | "API" | "SYSTEM";
  correlationId?: string | null; metadata?: Record<string, unknown>; occurredAt?: Date;
}) {
  return tx.auditLog.create({data:{
    organizationId:input.organizationId,branchId:input.branchId,actorUserId:input.actorUserId,
    actorMembershipId:input.actorMembershipId,action:input.action.slice(0,120),entityType:input.entityType.slice(0,80),
    entityId:input.entityId?.slice(0,100),result:input.result??"SUCCESS",source:input.source??"CRM",
    correlationId:input.correlationId?.slice(0,100),metadata:sanitizeAuditMetadata(input.metadata),occurredAt:input.occurredAt
  }});
}
