import 'server-only';
import {db} from '@/lib/db';
import {customerStore} from './customer-store';
import {authorizeCustomer} from './customer-access';
import {withCustomerCatalog} from './catalog-context';
import {createCrmTools} from '../chat/tools';
import {recordTurn,reviewRecordedTurn} from '../chat/recorded-turn';
import {openAIProvider} from '../chat/provider';
import {assertProviderTurnBudget} from '../chat/provider-budget';
import {CONSULTATION_LIMITS} from '../chat/consultation';
import {telegramNetwork} from './network';
import type {HandlerPorts} from './handler';
import type {TelegramScope} from './adapter';
import {customerReplyDelivery} from './customer-reply-delivery';
export function customerRuntime(token:string,updateId:number,signal:AbortSignal,deadlineAt?:number):HandlerPorts{
 const authorize=authorizeCustomer,store=customerStore(authorize);
 const tools=(s:TelegramScope)=>createCrmTools({organizationId:s.organizationId,allowedBranchIds:[s.branchId],hasOrganizationWideBranchAccess:false});
 const provider=(s:TelegramScope,planning:boolean)=>{let calls=0;return {create:async(...args:Parameters<ReturnType<typeof openAIProvider>['create']>)=>{
  await authorize(s);if(planning&&calls===0)await assertProviderTurnBudget(s);
  if(++calls>(planning?CONSULTATION_LIMITS.modelCalls-1:1))throw Error('Customer call limit');
  const rows=await db.$queryRaw<{id:string}[]>`SELECT t.id FROM assistant_telegram_customer_turns t JOIN assistant_telegram_customers c ON c.id=t.binding_id WHERE c.organization_id=${s.organizationId}::uuid AND c.bot_id=${s.botId} AND c.chat_id=${s.chatId} AND c.generation=${s.generation}::uuid AND t.update_id=${updateId} AND t.kind='dialogue'`;
  if(rows.length!==1)throw Error('Customer attempt context denied');
  return openAIProvider({organizationId:s.organizationId,membershipId:s.membershipId,customerTurnId:rows[0].id},{checkpointOnly:planning,deadlineAt,diagnostic:event=>console.info('telegram_provider',JSON.stringify(event))}).create(...args);
 }}};
 return {...store,authorize,send:telegramNetwork(token).send,
 sendReply:(s,reply,text)=>customerReplyDelivery(token,s,reply,text,updateId),
 plan:(s,input)=>withCustomerCatalog(s,async()=>recordTurn(input,provider(s,true),await tools(s),signal)),
 review:(s,turn)=>withCustomerCatalog(s,async()=>reviewRecordedTurn(turn,provider(s,false),await tools(s),signal))};
}
