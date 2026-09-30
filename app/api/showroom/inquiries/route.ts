import { submitPublicInquiry, ShowroomError } from "@/lib/showroom/service";
import { boundedJson, failure, pressureLimit, reply } from "@/lib/showroom/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    pressureLimit("write");
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")
      throw new ShowroomError("Отправьте заявку через форму витрины.", 403);
    await submitPublicInquiry(await boundedJson(request));
    // No inquiry ID, saved contact, staff identity or CRM data in the response.
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
