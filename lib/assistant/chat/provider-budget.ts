import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AssistantError } from './limits';
// Local candidate only: live migration and activation are a separate release.
export const PROVIDER_BUDGET_OPEN = false;
export type ProviderScope={organizationId:string;membershipId:string};
const scopeSchema=z.object({organizationId:z.string().uuid(),membershipId:z.string().uuid()}).strict();
export async function reserveProviderCall(raw:ProviderScope,inputBytes:number,outputTokens:number){
  if(!PROVIDER_BUDGET_OPEN)throw new AssistantError('Серверный лимит помощника пока не подключён.',503);
  const scope=scopeSchema.parse(raw);
  if(!Number.isInteger(inputBytes)||inputBytes<1||inputBytes>48000||!Number.isInteger(outputTokens)||outputTokens<1||outputTokens>1400)throw new AssistantError('Запрос превышает серверный лимит модели.',413);
  const id=randomUUID();
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+scope.organizationId},0))`;
    const member=await tx.organizationMembership.findFirst({where:{id:scope.membershipId,organizationId:scope.organizationId,status:'ACTIVE',organization:{status:'ACTIVE'}},select:{id:true}});
    if(!member)throw new AssistantError('Доступ к помощнику недоступен.',403);
    // Aggregate metadata only, no prompts, contacts, credentials or model output.
    await tx.$executeRaw`DELETE FROM assistant_provider_attempts WHERE organization_id=${scope.organizationId}::uuid AND created_at<now()-interval '1 day'`;
    const [usage]=await tx.$queryRaw<{minute:bigint;hour:bigint;active:bigint}[]>`SELECT count(*) FILTER(WHERE membership_id=${scope.membershipId}::uuid AND created_at>now()-interval '1 minute') AS minute,count(*) FILTER(WHERE membership_id=${scope.membershipId}::uuid AND created_at>now()-interval '1 hour') AS hour,count(*) FILTER(WHERE lease_until>now()) AS active FROM assistant_provider_attempts WHERE organization_id=${scope.organizationId}::uuid`;
    if(usage.minute>=BigInt(4)||usage.hour>=BigInt(20)||usage.active>=BigInt(2))throw new AssistantError('Лимит обращений к модели исчерпан. Попробуйте позже.',429);
    await tx.$executeRaw`INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap) VALUES (${id}::uuid,${scope.organizationId}::uuid,${scope.membershipId}::uuid,now(),now()+interval '30 seconds',${inputBytes},${outputTokens})`;
  });
  // Failed/aborted/unknown attempts still count. Never refund a potentially billed call.
  return async()=>{await db.$executeRaw`UPDATE assistant_provider_attempts SET lease_until=now() WHERE id=${id}::uuid AND organization_id=${scope.organizationId}::uuid`;};
}
