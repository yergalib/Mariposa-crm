import 'server-only';
import {telegramConfig,TELEGRAM_INGRESS_HOST} from './config';
import {requireOwnerDaySession} from '../owner-day-access';
import {customerConfig} from './customer-config';
const headers={'cache-control':'private, no-store'};
export async function connectTelegram(request:Request,transport:typeof fetch=fetch){
  const cfg=telegramConfig();if(!cfg)return Response.json({status:'disabled'},{status:404,headers});
  if(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')!=='same-origin')return Response.json({status:'forbidden'},{status:403,headers});
  try{await requireOwnerDaySession();}catch{return Response.json({status:'owner_required'},{status:403,headers});}
  const target=`https://${TELEGRAM_INGRESS_HOST}/api/telegram/webhook`;
  const allowedUpdates=customerConfig()?['message','callback_query']:['message'];
  const matches=(info:{url?:unknown;allowed_updates?:unknown;max_connections?:unknown})=>info.url===target&&Array.isArray(info.allowed_updates)&&info.allowed_updates.length===allowedUpdates.length&&allowedUpdates.every(v=>info.allowed_updates instanceof Array&&info.allowed_updates.includes(v))&&info.max_connections===1;
  async function api(method:'getMe'|'getWebhookInfo'|'setWebhook',body:object={}){
    const r=await transport(`https://api.telegram.org/bot${cfg!.token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Unconfirmed');const raw=await r.text();if(raw.length>32000)throw Error('Unconfirmed');const data=JSON.parse(raw);if(data.ok!==true)throw Error('Unconfirmed');return data.result;
  }
  try{
    const me=await api('getMe');if(me.id!==8768793138||me.id!==cfg.botId||me.username!=='Mariposaastana_bot'||me.is_bot!==true)throw Error('Wrong bot');
    const before=await api('getWebhookInfo');
    if(matches(before))return Response.json({status:'connected',hostname:TELEGRAM_INGRESS_HOST,allowedUpdates},{headers});
    if(before.url!==target&&(typeof before.url!=='string'||new URL(before.url).hostname!=='mariposaastana-bot.onrender.com'))return Response.json({status:'unexpected_previous_webhook'},{status:409,headers});
    if(before.url!==target&&before.pending_update_count!==0)return Response.json({status:'pending_updates_require_review'},{status:409,headers});
    const probe=await transport(target,{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':cfg.secret},body:JSON.stringify({update_id:0}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(probe.status!==200)return Response.json({status:'callback_unavailable'},{status:409,headers});await probe.body?.cancel();
    // One mutation only; never retry after an uncertain transport outcome.
    try{await api('setWebhook',{url:target,secret_token:cfg.secret,allowed_updates:allowedUpdates,max_connections:1,drop_pending_updates:false});}catch{/* Establish outcome by readback only. */}
    const after=await api('getWebhookInfo');
    if(!matches(after))return Response.json({status:'switch_unconfirmed'},{status:409,headers});
    return Response.json({status:'connected',hostname:TELEGRAM_INGRESS_HOST,allowedUpdates},{headers});
  }catch{return Response.json({status:'verification_unconfirmed'},{status:503,headers});}
}
