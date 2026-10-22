import 'server-only';
import {authenticateWebhook,prepareTelegram,finishTelegram,type TelegramBinding,type TelegramPorts,telegramScope} from './adapter';
import {deliverTelegram,type DeliveryPorts} from './delivery';
import type {ChatReply} from '../chat/contracts';
import {formatCatalogMoney} from '@/lib/showroom/money';

export function renderTelegramReply(reply:ChatReply){
  const lines=[reply.message,...(reply.facts??[]).flatMap(f=>f.lines)];
  for(const card of reply.cards){
    lines.push(`${card.item.name} · ${card.item.execution??''} · ${card.item.size}`);
    if(card.item.price)lines.push(formatCatalogMoney(card.item.price.amountMinor,card.item.price.currency));
    lines.push(`${card.from.slice(0,10)} — ${card.until.slice(0,10)}; возврат до 12:00`);
    lines.push(card.item.available?'Доступно на выбранные даты; подтверждает сотрудник.':'Недоступно на выбранные даты.');
  }
  for(const product of reply.comparisons??[])lines.push(`Для сравнения: ${product.name} · ${product.color??'цвет не указан'} · ${product.sizes.join(', ')}`);
  const result=lines.filter(Boolean).join('\n');
  // Never truncate a disclaimer or silently drop verified facts.
  if(result.length>4096)throw new Error('Telegram reply too large');
  return result;
}
export type HandlerPorts=TelegramPorts&DeliveryPorts;
export async function handleTelegramUpdate(config:{enabled:boolean;webhookSecret?:string},header:string|null,
  binding:TelegramBinding,raw:unknown,ports:HandlerPorts,resume=false){
  if(!config.enabled)return {status:404,outcome:'disabled'};
  authenticateWebhook(config.webhookSecret,header);
  const {scope}=telegramScope(binding,raw);
  // Resume may only read/review an already accepted update. Never plan on resume.
  let view:Awaited<ReturnType<typeof prepareTelegram>>;
  if(resume)throw new Error('Use explicit existing checkpoint resume');
  view=await prepareTelegram(binding,raw,ports);
  if(view.planned)return {status:503,outcome:'review_pending',checkpointId:view.id};
  if(view.status==='blocked'||view.status==='expired')return {status:200,outcome:view.status};
  const result=await finishTelegram(binding,raw,view.id,ports);
  if(result.status==='pending')return {status:503,outcome:'review_pending',checkpointId:view.id};
  if(result.status!=='complete')return {status:200,outcome:result.status};
  if(result.result.kind!=='complete')throw new Error('Unreviewed Telegram result');
  const update=(raw as {update_id:number}).update_id;
  const delivered=await deliverTelegram(scope,String(update),renderTelegramReply(result.result.reply),ports);
  return {status:200,outcome:delivered.status};
}
export async function resumeTelegramUpdate(binding:TelegramBinding,raw:unknown,id:string,ports:HandlerPorts){
  const {scope,update}=telegramScope(binding,raw);
  const result=await finishTelegram(binding,raw,id,ports); // Scoped read/CAS only.
  if(result.status!=='complete')return {status:result.status};
  if(result.result.kind!=='complete')throw new Error('Unreviewed Telegram result');
  return deliverTelegram(scope,String(update.update_id),renderTelegramReply(result.result.reply),ports);
}
