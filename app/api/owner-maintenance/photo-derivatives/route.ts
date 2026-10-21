import { repairNextApprovedSource, repairStatus } from '@/lib/catalog/approved-derivatives-repair';
import { AssistantError } from '@/lib/assistant/chat/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const origin = 'https://mariposa-crm-git-review-website-current-20261009-mariposa-crm.vercel.app';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function failure(error: unknown) {
  return Response.json({ error: error instanceof AssistantError ? 'OWNER_ACCESS_REQUIRED' : 'REPAIR_STOPPED_VERIFY_STATUS' },
    { status: error instanceof AssistantError ? error.status : 503, headers });
}
export async function GET() {
  try {
    const status = await repairStatus();
    return Response.json({ sources: 62, objects: 124, present: status.flatMap(row => row.derivatives).filter(row => row.exists).length, status }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  // A fixed operation only. No image/path/query/payload or cross-origin invocation.
  const url = new URL(request.url);
  if (url.origin !== origin || url.search || request.headers.get('origin') !== origin
    || request.headers.get('sec-fetch-site') !== 'same-origin')
    return Response.json({ error: 'ORIGIN_REJECTED' }, { status: 403, headers });
  if (request.headers.get('content-length') && request.headers.get('content-length') !== '0')
    return Response.json({ error: 'BODY_REJECTED' }, { status: 400, headers });
  if (request.body) {
    const reader = request.body.getReader();
    const chunk = await reader.read();
    await reader.cancel();
    if (chunk.value?.length) return Response.json({ error: 'BODY_REJECTED' }, { status: 400, headers });
  }
  try { return Response.json(await repairNextApprovedSource(), { headers }); }
  catch (error) { return failure(error); }
}
