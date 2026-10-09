import { publicPhoto } from "@/lib/showroom/service";
import { pressureLimit } from "@/lib/showroom/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
  try {
    pressureLimit("read");
    const query = new URL(request.url).searchParams;
    const photo = await publicPhoto({ productId: query.get("productId"), executionId: query.get("executionId") || null, imageId: query.get("imageId") });
    if (!photo) return new Response(null, { status: 404, headers });
    return new Response(photo, { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(photo.size) } });
  } catch { return new Response(null, { status: 404, headers }); }
}
