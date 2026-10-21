import { publicPurchaseSelection, ShowroomError } from '@/lib/showroom/service';
import { failure, pressureLimit, reply } from '@/lib/showroom/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    pressureLimit('read');
    const params = new URL(request.url).searchParams;
    if (request.url.length > 1500 || new Set(params.keys()).size !== [...params.keys()].length) throw new ShowroomError('Проверьте параметры покупки.');
    return reply(await publicPurchaseSelection(Object.fromEntries(params)));
  } catch (error) { return failure(error); }
}
