import { publicPhoto, ShowroomError } from '@/lib/showroom/service';
import { mediaPressureLimit, publicPhotoETag, PublicMediaError } from '@/lib/showroom/media';
import { z } from 'zod';
import { ownerMainRestricted } from '@/lib/assistant/owner-day-config';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const headers={'Cache-Control':ownerMainRestricted()?'private, no-store':'private, no-cache, must-revalidate','Vary':'Cookie','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
  try{
    mediaPressureLimit();const query=new URL(request.url).searchParams;
    if(request.url.length>1500||new Set(query.keys()).size!==[...query.keys()].length)throw new PublicMediaError(400);
    const photo=await publicPhoto({productId:query.get('productId'),executionId:query.get('executionId')||null,imageId:query.get('imageId'),rendition:query.get('rendition')||'site'});
    if(!photo)return new Response(null,{status:404,headers:{...headers,'Cache-Control':'no-store'}});
    const etag=publicPhotoETag(photo);
    if(etag&&request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{...headers,ETag:etag}});
    return new Response(photo,{headers:{...headers,'Content-Type':'image/webp','Content-Length':String(photo.size),...(etag?{ETag:etag}:{})}});
  }catch(error){const status=error instanceof PublicMediaError||error instanceof ShowroomError?error.status:error instanceof z.ZodError?400:503;return new Response(null,{status,headers:{...headers,'Cache-Control':'no-store',...(status===429?{'Retry-After':String(error instanceof PublicMediaError?error.retryAfter:60)}:{})}})}
}
