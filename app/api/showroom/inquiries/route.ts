import { submitPublicInquiry, ShowroomError } from "@/lib/showroom/service";
import { boundedJson, failure, pressureLimit, reply } from "@/lib/showroom/http";
import { requireInquiryIntake } from '@/lib/showroom/inquiry-access';
import { AssistantError } from '@/lib/assistant/chat/limits';
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    // Reject before parsing contacts or entering the write service.
    const actor = await requireInquiryIntake();
    pressureLimit("write");
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")
      throw new ShowroomError("Отправьте заявку через форму витрины.", 403);
    const result = await submitPublicInquiry(await boundedJson(request));
    // Only the authorized owner receives a receipt ID; no contacts/staff data.
    return reply({ ok: true, ...(actor ? { inquiryId: result.id } : {}) });
  } catch (error) {
    // Never log exception messages, query parameters, payloads, contacts or session IDs.
    if (!(error instanceof AssistantError) && !(error instanceof ShowroomError)) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
      console.error('showroom_inquiry_failure', { category: typeof code === 'string' && /^P\d{4}$/.test(code) ? code : 'unclassified' });
    }
    return failure(error instanceof AssistantError ? new ShowroomError(error.message, error.status) : error);
  }
}
