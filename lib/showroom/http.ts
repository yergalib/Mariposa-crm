import "server-only";
import { NextResponse } from "next/server";
import { ShowroomError } from "./service";

export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(status === 429 ? { "Retry-After": "3600" } : {}) } });
}
export function failure(error: unknown) {
  return error instanceof ShowroomError ? reply({ error: error.message }, error.status)
    : reply({ error: "Витрина временно недоступна. Попробуйте позже." }, 503);
}
// Cheap per-process pressure limit before database work. The write service also
// enforces durable organization/contact quotas under a database lock.
let windowStart = 0, reads = 0, writes = 0;
export function pressureLimit(kind: "read" | "write") {
  if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); reads = 0; writes = 0; }
  const over = kind === "read" ? ++reads > 120 : ++writes > 30;
  if (over) throw new ShowroomError("Слишком много запросов. Попробуйте позже.", 429);
}
export async function boundedJson(request: Request, maxBytes = 4096): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ShowroomError("Нужна JSON-форма.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new ShowroomError("Форма слишком большая.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ShowroomError("Пустая форма.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new ShowroomError("Форма слишком большая.", 413); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ShowroomError("Некорректная форма."); }
  } finally { reader.releaseLock(); }
}
