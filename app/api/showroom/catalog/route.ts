import { publicCatalog, ShowroomError } from "@/lib/showroom/service";
import { failure, pressureLimit, reply } from "@/lib/showroom/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    pressureLimit("read");
    if (request.url.length > 1500) throw new ShowroomError("Слишком длинный запрос.");
    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== [...params.keys()].length) throw new ShowroomError("Повторяющиеся параметры.");
    return reply(await publicCatalog(Object.fromEntries(params)));
  } catch (error) { return failure(error); }
}
