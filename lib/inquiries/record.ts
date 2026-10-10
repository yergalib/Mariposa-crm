import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { appendAuditLog } from "@/lib/audit/log";

// Shared persistence only. Callers retain their distinct staff/public authorization,
// publication checks, transaction lock, validation and idempotency rules.
export async function createInquiryRecord(tx: Prisma.TransactionClient, data: Prisma.InquiryUncheckedCreateInput,
  audit: { actorUserId?: string; actorMembershipId?: string; source?: "API"; itemCount: number }) {
  const inquiry = await tx.inquiry.create({ data, select: { id: true } });
  await appendAuditLog(tx, { organizationId: data.organizationId, branchId: data.branchId,
    actorUserId: audit.actorUserId, actorMembershipId: audit.actorMembershipId, source: audit.source,
    action: "INQUIRY_CREATED", entityType: "Inquiry", entityId: inquiry.id,
    metadata: { sourceType: data.source ?? "CRM", itemCount: audit.itemCount } });
  return inquiry;
}
