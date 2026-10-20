import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { getCurrentSession } from "@/lib/auth/session";
import { ShowroomError } from "@/lib/showroom/service";
import { boundedJson, pressureLimit } from "@/lib/showroom/http";
import { historyEnabled } from "@/lib/assistant/history/access";
import { pilotTestRequested } from '@/lib/assistant/pilot-test-config';
import { ownerMainRestricted } from '@/lib/assistant/owner-day-config';
import { requireOwnerDaySession } from '@/lib/assistant/owner-day-access';
import { AssistantError } from '@/lib/assistant/chat/limits';
import { assertPilotSession, pilotWindow, startPilotWindow, requirePilotWindow, PilotTestError } from '@/lib/assistant/pilot-test';
import { readHistory, writeHistory, revokeHistory, HistoryError, type HistoryOwner } from "@/lib/assistant/history/service";
export const dynamic="force-dynamic";
const COOKIE="mariposa-history";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
async function handle(request:Request) {
  try {
    if(!historyEnabled(process.env.STOREFRONT_ORGANIZATION_ID))throw new HistoryError("Сохранение истории пока не подключено.",503);
    const organizationId=process.env.STOREFRONT_ORGANIZATION_ID;
    if(!z.string().uuid().safeParse(organizationId).success || process.env.VERCEL_ENV==='production')throw new HistoryError("История пока недоступна.",503);
    if(request.headers.get('sec-fetch-site')==='cross-site'||(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin))throw new HistoryError("Откройте форму на сайте MARIPOSA.",403);
    pressureLimit(request.method==='GET'?'read':'write');
    const session=await getCurrentSession();
    if (ownerMainRestricted()) await requireOwnerDaySession();
    if (pilotTestRequested()) assertPilotSession(session);
    if(!session && request.headers.get('cookie')?.split(';').some(s=>s.trim().startsWith(SESSION_COOKIE_NAME+'=')))throw new HistoryError('Сессия входа истекла. Обновите вход перед продолжением.',403);
    if(session&&(session.organizationId!==organizationId||session.expiresAt<=new Date()))throw new HistoryError("История недоступна в этой сессии.",403);
    const candidate=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    const existing=candidate&&/^[A-Za-z0-9_-]{43}$/.test(candidate)?candidate:null;
    if (pilotTestRequested()) {
      const window = await pilotWindow();
      if (request.method === 'GET' && window.status !== 'active') return response({history:null,ownershipReady:Boolean(existing),pilotTest:window});
      if (request.method === 'DELETE') throw new PilotTestError('Удаление в тесте отключено.');
    }
    if(!existing&&request.method==='GET')return response({history:null,ownershipReady:false,...(pilotTestRequested()?{pilotTest:await pilotWindow()}: {})});
    const raw=request.method==='POST'?await boundedJson(request,14000):undefined;
    if (pilotTestRequested() && request.method === 'POST' && z.object({action:z.literal('start-test')}).strict().safeParse(raw).success)
      return response({pilotTest:await startPilotWindow()});
    if (pilotTestRequested()) await requirePilotWindow();
    // Bootstrap stores no transcript. The next request must return this HttpOnly
    // capability before any durable write; losing this response leaves no record.
    if(request.method==='POST' && z.object({action:z.literal('prepare')}).strict().safeParse(raw).success){
      const result=response({prepared:true});
      result.cookies.set(COOKIE,existing??randomBytes(32).toString('base64url'),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:7*86400});
      return result;
    }
    if(!existing)throw new HistoryError('Подтвердите доступ этого браузера к истории перед сохранением или удалением.',428);
    const token=existing;
    const owner:HistoryOwner={organizationId:organizationId!,ownerHash:hash(token),principal:session?hash(JSON.stringify([session.organizationId,session.userId,session.sessionId])):'guest'};
    if(request.method==='GET')return response({history:await readHistory(owner),ownershipReady:true,...(pilotTestRequested()?{pilotTest:await pilotWindow()}: {})});
    if(request.method==='DELETE') {await revokeHistory(owner);const result=response({revoked:true});result.cookies.set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});return result;}
    const history=await writeHistory(owner,raw);
    const result=response({history});result.cookies.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',expires:new Date(history.expiresAt)});return result;
  } catch(error) {
    const known=error instanceof HistoryError || error instanceof ShowroomError || error instanceof PilotTestError || error instanceof AssistantError;
    return response({error:known?error.message:'Не удалось подтвердить сохранение. Восстановите историю или повторите то же действие.'},known?error.status:503,error instanceof ShowroomError?error.retryAfter:3600);
  }
}
function response(value:unknown,status=200,retryAfter=3600){return NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':String(retryAfter)}:{})}})}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
