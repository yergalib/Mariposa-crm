import 'server-only';
import {requireOwnerDaySession} from '@/lib/assistant/owner-day-access';
const headers={'cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
export function webhookDestination(raw:string){
  if(!raw)return {hostname:null,service:'not configured'};
  const url=new URL(raw);
  if(url.protocol!=='https:')throw new Error('Invalid destination');
  const hostname=url.hostname.toLowerCase();
  // Infrastructure labels do not establish the application or its owner.
  const service=hostname==='hooks.zapier.com'?'Zapier hostname':/^hook(?:\.[a-z0-9]+)?\.make\.com$/.test(hostname)?'Make hostname':hostname.endsWith('.vercel.app')?'Vercel hosting; application unknown':'unknown';
  return {hostname,service};
}
export async function inspectTelegram(request:Request,transport:typeof fetch=fetch){
  // This temporary route has no dependency on the inactive Telegram integration.
  if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')!=='same-origin')
    return Response.json({error:'Forbidden'},{status:403,headers});
  try{await requireOwnerDaySession();}catch{return Response.json({error:'Owner authorization required'},{status:403,headers});}
  const token=process.env.MARIPOSA_TELEGRAM_BOT_TOKEN;
  if(!token||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token))return Response.json({error:'Server credential unavailable'},{status:503,headers});
  // Only these two hardcoded read-only methods. Never log the request URL,
  // credential, raw Telegram response or exception; never redirect or retry.
  async function read(method:'getMe'|'getWebhookInfo'){
    const response=await transport(`https://api.telegram.org/bot${token}/${method}`,{
      method:'POST',headers:{'content-type':'application/json'},body:'{}',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('Unconfirmed');
    const raw=await response.text();if(raw.length>32000)throw new Error('Too large');
    const value=JSON.parse(raw);
    if(value?.ok!==true||!value.result)throw new Error('Unconfirmed');
    return value.result;
  }
  try{
    const bot=await read('getMe');
    if(!Number.isSafeInteger(bot.id)||bot.id<=0||bot.is_bot!==true||typeof bot.username!=='string'||!/^\w{5,64}$/.test(bot.username))throw new Error('Identity unavailable');
    const webhook=await read('getWebhookInfo');
    if(typeof webhook.url!=='string'||!Number.isSafeInteger(webhook.pending_update_count)||webhook.pending_update_count<0)throw new Error('Status unavailable');
    return Response.json({bot:{id:bot.id,username:bot.username,isBot:true},webhook:{configured:webhook.url.length>0,pendingUpdates:webhook.pending_update_count,...webhookDestination(webhook.url)}},{headers});
  }catch{return Response.json({error:'Telegram read-only verification unconfirmed'},{status:502,headers});}
}
