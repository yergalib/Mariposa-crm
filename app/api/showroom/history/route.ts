import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { ShowroomError } from "@/lib/showroom/service";
import { boundedJson, pressureLimit } from "@/lib/showroom/http";
import { HISTORY_OPEN } from "@/lib/assistant/history/contracts";
import { readHistory, writeHistory, revokeHistory, HistoryError, type HistoryOwner } from "@/lib/assistant/history/service";
export const dynamic="force-dynamic";
const COOKIE="mariposa-history";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
async function handle(request:Request) {
  try {
    if(!HISTORY_OPEN)throw new HistoryError("Сохранение истории пока не подключено.",503);
    const organizationId=process.env.STOREFRONT_ORGANIZATION_ID;
    if(!z.string().uuid().safeParse(organizationId).success || process.env.VERCEL_ENV==='production')throw new HistoryError("История пока недоступна.",503);
    if(request.headers.get('sec-fetch-site')==='cross-site'||(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin))throw new HistoryError("Откройте форму на сайте MARIPOSA.",403);
    pressureLimit(request.method==='GET'?'read':'write');
    const session=await getCurrentSession();
    if(session&&(session.organizationId!==organizationId||session.expiresAt<=new Date()))throw new HistoryError("История недоступна в этой сессии.",403);
    const candidate=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    const existing=candidate&&/^[A-Za-z0-9_-]{43}$/.test(candidate)?candidate:null;
    if(!existing&&request.method==='GET')return response({history:null});
    if(!existing&&request.method==='DELETE')return response({revoked:true});
    const token=existing??randomBytes(32).toString('base64url');
    const owner:HistoryOwner={organizationId:organizationId!,ownerHash:hash(token),principal:session?hash(JSON.stringify([session.organizationId,session.userId,session.sessionId])):'guest'};
    if(request.method==='GET')return response({history:await readHistory(owner)});
    if(request.method==='DELETE') {await revokeHistory(owner);const result=response({revoked:true});result.cookies.set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});return result;}
    const raw=await boundedJson(request,14000);
    const history=await writeHistory(owner,raw);
    const result=response({history});result.cookies.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',expires:new Date(history.expiresAt)});return result;
  } catch(error) {
    const known=error instanceof HistoryError || error instanceof ShowroomError;
    return response({error:known?error.message:'Не удалось подтвердить сохранение. Восстановите историю или повторите то же действие.'},known?error.status:503);
  }
}
function response(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'3600'}:{})}})}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
