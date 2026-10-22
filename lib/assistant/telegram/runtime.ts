import 'server-only';
import {db} from '@/lib/db';
import {z} from 'zod';
import {ownerDayConfig} from '../owner-day-config';
import {authorizeTelegramOwner} from './owner';
import {withTelegramCatalog} from './catalog-context';
import {createCrmTools} from '../chat/tools';
import {telegramEngine} from './engine';
import {telegramStore} from './store';
import {telegramNetwork} from './network';
import type {TelegramBinding} from './adapter';
import type {HandlerPorts} from './handler';
import type {Prisma} from '@/generated/prisma/client';
export const telegramEnvelope=z.object({update_id:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),message:z.object({message_id:z.number().int().positive(),date:z.number().int(),
  from:z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),is_bot:z.literal(false)}),chat:z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),type:z.literal('private')}),text:z.string().min(1).max(700)})});
export async function loadTelegramBinding(raw:unknown,botId:number):Promise<TelegramBinding>{
  const event=telegramEnvelope.parse(raw),config=ownerDayConfig();
  if(!config||event.message.from.id!==event.message.chat.id)throw new Error('Telegram disabled');
  const rows=await db.$queryRaw<{branch_id:string;generation:string;starts_at:Date;expires_at:Date}[]>`SELECT branch_id,generation,starts_at,expires_at FROM assistant_telegram_bindings
    WHERE organization_id=${config.organizationId}::uuid AND membership_id=${config.membershipId}::uuid AND bot_id=${botId}
    AND sender_id=${event.message.from.id} AND chat_id=${event.message.chat.id} AND enabled=true AND consent_at IS NOT NULL
    AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()`;
  if(rows.length!==1)throw new Error('Telegram binding unavailable');
  return {enabled:true,consent:true,organizationId:config.organizationId,membershipId:config.membershipId,branchId:rows[0].branch_id,
    generation:rows[0].generation,botId,userId:event.message.from.id,chatId:event.message.chat.id,start:rows[0].starts_at.getTime(),until:rows[0].expires_at.getTime()};
}
export function telegramRuntime(token:string,signal:AbortSignal):HandlerPorts{
  const authorize=(scope:Parameters<typeof authorizeTelegramOwner>[0],tx?:Prisma.TransactionClient)=>authorizeTelegramOwner(scope,false,tx),store=telegramStore(authorize),network=telegramNetwork(token);
  const engine=telegramEngine(authorize,scope=>createCrmTools({organizationId:scope.organizationId,allowedBranchIds:[scope.branchId],hasOrganizationWideBranchAccess:false}),signal);
  return {...store,authorize,send:network.send,
    plan:(scope,input)=>withTelegramCatalog(scope,()=>engine.plan(scope,input)),
    review:(scope,turn)=>withTelegramCatalog(scope,()=>engine.review(scope,turn))};
}
