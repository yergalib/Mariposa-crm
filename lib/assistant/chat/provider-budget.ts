import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { AssistantError } from './limits';
import { ownerTestConfig, OWNER_TEST } from './owner-test';
export type ProviderScope={organizationId:string;membershipId:string};
export async function reserveProviderCall(scope:ProviderScope,inputBytes:number,outputTokens:number){
  const config=ownerTestConfig();
  if(!config)throw new AssistantError('Личный тест не включён или его время истекло.',503);
  if(scope.organizationId!==config.organizationId||scope.membershipId!==config.membershipId)throw new AssistantError('Доступ к личному тесту запрещён.',403);
  if(!Number.isInteger(inputBytes)||inputBytes<1||inputBytes>OWNER_TEST.planningBytes||!Number.isInteger(outputTokens)||outputTokens<1||outputTokens>OWNER_TEST.planningOutput)throw new AssistantError('Запрос превышает лимит модели.',413);
  const id=randomUUID(),start=new Date(config.start),until=new Date(config.until);
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+scope.organizationId},0))`;
    const member=await tx.organizationMembership.findFirst({where:{id:scope.membershipId,organizationId:scope.organizationId,status:'ACTIVE',role:'OWNER',organization:{status:'ACTIVE'}},select:{id:true}});
    if(!member)throw new AssistantError('Доступ к помощнику недоступен.',403);
    const [usage]=await tx.$queryRaw<{minute:bigint;hour:bigint;test:bigint;active:bigint;in_window:boolean}[]>`SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute') AS minute,count(*) FILTER(WHERE created_at>now()-interval '1 hour') AS hour,count(*) FILTER(WHERE created_at>=${start}) AS test,count(*) FILTER(WHERE lease_until>now()) AS active,(now()>=${start} AND now()<${until}) AS in_window FROM assistant_provider_attempts WHERE organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid`;
    if(!usage.in_window)throw new AssistantError('Время личного теста истекло.',503);
    if(usage.minute>=BigInt(OWNER_TEST.minuteCalls)||usage.hour>=BigInt(OWNER_TEST.calls)||usage.test>=BigInt(OWNER_TEST.calls)||usage.active>=BigInt(1)||(usage.test+BigInt(1))*BigInt(OWNER_TEST.reservationNano)>BigInt(OWNER_TEST.budgetNano))throw new AssistantError('Лимит личного теста исчерпан или предыдущий вызов не подтверждён.',429);
    // Lease covers the entire test, not just HTTP timeout. Crash/unknown usage stays
    // debited and blocks further calls across instances. Only verified usage releases it.
    await tx.$executeRaw`INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap) VALUES (${id}::uuid,${scope.organizationId}::uuid,${scope.membershipId}::uuid,now(),${until},${inputBytes},${outputTokens})`;
  });
  return async()=>{await db.$executeRaw`UPDATE assistant_provider_attempts SET lease_until=now() WHERE id=${id}::uuid AND organization_id=${scope.organizationId}::uuid`;};
}
