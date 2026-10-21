import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { AssistantError } from './limits';
import { ownerTestConfig, ownerTestPolicy } from './owner-test';
import { OWNER_DAY, ownerMainRestricted } from '../owner-day-config';
export type ProviderScope={organizationId:string;membershipId:string;activationSmoke?:true};
// Read-only admission for a complete worst-case turn. Per-call transactional
// reservations remain authoritative if another request races this preflight.
export async function assertProviderTurnBudget(scope: ProviderScope) {
  const config = ownerTestConfig(), policy = ownerTestPolicy();
  if (!config || scope.organizationId !== config.organizationId || scope.membershipId !== config.membershipId) throw new AssistantError('Личный тест недоступен.', 403);
  const start = new Date(config.start), until = new Date(config.until), legacy = new Date(OWNER_DAY.initialUntil);
  const [usage] = await db.$queryRaw<{ calls: bigint; reviews: bigint; active: bigint; in_window: boolean }[]>`SELECT count(*) FILTER(WHERE created_at>=GREATEST(${start},date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')) AS calls,count(*) FILTER(WHERE output_token_cap=300 AND created_at>=GREATEST(${start},date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')) AS reviews,count(*) FILTER(WHERE lease_until>now() OR lease_until=${legacy}) AS active,(now()>=${start} AND now()<${until}) AS in_window FROM assistant_provider_attempts WHERE organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid`;
  const previous = usage.calls * BigInt(policy.reservationNano) - usage.reviews * BigInt(policy.reservationNano - policy.reviewReservationNano);
  const wholeTurn = BigInt(3 * policy.reservationNano + policy.reviewReservationNano);
  if (!usage.in_window || usage.active > BigInt(0) || usage.calls + BigInt(4) > BigInt(policy.calls) || previous + wholeTurn > BigInt(policy.budgetNano)) throw new AssistantError('На полный ответ с проверкой не хватает дневного лимита, либо предыдущий запрос ещё не завершён. Пожелания сохранены.', 429);
}
export async function reserveProviderCall(scope:ProviderScope,inputBytes:number,outputTokens:number){
  const config=ownerTestConfig();
  const OWNER_TEST=ownerTestPolicy();
  if(!config)throw new AssistantError('Личный тест не включён или его время истекло.',503);
  if(scope.organizationId!==config.organizationId||scope.membershipId!==config.membershipId)throw new AssistantError('Доступ к личному тесту запрещён.',403);
  if (scope.activationSmoke && ownerMainRestricted()) throw new AssistantError('Повторный проверочный вызов не разрешён.', 403);
  if (scope.activationSmoke && (!ownerMainRestricted() || outputTokens !== 64)) throw new AssistantError('Проверочный вызов недоступен.', 403);
  if (ownerMainRestricted() && !scope.activationSmoke && ![1400, 300].includes(outputTokens)) throw new AssistantError('Недопустимый лимит вызова.', 413);
  if(!Number.isInteger(inputBytes)||inputBytes<1||inputBytes>OWNER_TEST.planningBytes||!Number.isInteger(outputTokens)||outputTokens<1||outputTokens>OWNER_TEST.planningOutput)throw new AssistantError('Запрос превышает лимит модели.',413);
  const id=randomUUID(),start=new Date(config.start),until=new Date(config.until);
  const legacyLeaseEnd = new Date(ownerMainRestricted() ? OWNER_DAY.initialUntil : 0);
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+scope.organizationId},0))`;
    const member=await tx.organizationMembership.findFirst({where:{id:scope.membershipId,organizationId:scope.organizationId,status:'ACTIVE',role:'OWNER',organization:{status:'ACTIVE'}},select:{id:true}});
    if(!member)throw new AssistantError('Доступ к помощнику недоступен.',403);
    const [usage]=await tx.$queryRaw<{minute:bigint;hour:bigint;test:bigint;reviews:bigint;smoke:bigint;active:bigint;in_window:boolean}[]>`SELECT count(*) FILTER(WHERE created_at>now()-interval '1 minute') AS minute,count(*) FILTER(WHERE created_at>now()-interval '1 hour') AS hour,count(*) FILTER(WHERE created_at>=GREATEST(${start}, date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')) AS test,count(*) FILTER(WHERE output_token_cap=300 AND created_at>=GREATEST(${start}, date_trunc('day', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')) AS reviews,count(*) FILTER(WHERE created_at>=${start} AND output_token_cap=64) AS smoke,count(*) FILTER(WHERE lease_until>now() OR lease_until=${legacyLeaseEnd}) AS active,(now()>=${start} AND now()<${until}) AS in_window FROM assistant_provider_attempts WHERE organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid`;
    if(!usage.in_window)throw new AssistantError('Время личного теста истекло.',503);
    if (scope.activationSmoke && usage.smoke !== BigInt(0)) throw new AssistantError('Проверочный вызов уже был учтён; повтор запрещён.', 429);
    const previousReserved = usage.test * BigInt(OWNER_TEST.reservationNano) - (usage.reviews ?? BigInt(0)) * BigInt(OWNER_TEST.reservationNano - OWNER_TEST.reviewReservationNano);
    const nextReserved = BigInt(outputTokens === 300 ? OWNER_TEST.reviewReservationNano : OWNER_TEST.reservationNano);
    if(usage.minute>=BigInt(OWNER_TEST.minuteCalls)||usage.hour>=BigInt(OWNER_TEST.calls)||usage.test>=BigInt(OWNER_TEST.calls)||usage.active>=BigInt(1)||previousReserved + nextReserved > BigInt(OWNER_TEST.budgetNano))throw new AssistantError('Лимит личного теста исчерпан или предыдущий вызов не подтверждён.',429);
    // Historical calls are conservatively charged at the selected policy rate; no reset or refund.
    // Calendar-day count uses DB time in Asia/Almaty; rows are never reset/deleted.
    // Preserve unresolved leases from the original closing time across the extension.
    // Lease covers the entire test, not just HTTP timeout. Crash/unknown usage stays
    // debited and blocks further calls across instances. Only verified usage releases it.
    await tx.$executeRaw`INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap) VALUES (${id}::uuid,${scope.organizationId}::uuid,${scope.membershipId}::uuid,now(),${until},${inputBytes},${outputTokens})`;
  });
  return async()=>{await db.$executeRaw`UPDATE assistant_provider_attempts SET lease_until=now() WHERE id=${id}::uuid AND organization_id=${scope.organizationId}::uuid`;};
}
