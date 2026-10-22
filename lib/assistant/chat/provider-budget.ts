import 'server-only';
import {settledDailyDebit,type SettlementReceipt} from './settled-budget';
import { assertTurnAdmission } from './turn-admission';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { AssistantError } from './limits';
import { ownerTestConfig, ownerTestPolicy } from './owner-test';
import { OWNER_DAY, ownerMainRestricted } from '../owner-day-config';
import { ledgerPrice, verifiedLedgerUsage } from './ledger-pricing';
export type ProviderScope={organizationId:string;membershipId:string;activationSmoke?:true;customerTurnId?:string};
type Reader = Pick<typeof db, '$queryRaw'>;
// Shared admission query: immutable per-attempt reserves, fixed legacy uncertainty
// allowance (not an inferred model). Verified receipts settle the budget projection only.
async function readUsage(tx: Reader, scope: ProviderScope, start: Date, until: Date) {
  const legacy = new Date(ownerMainRestricted() ? OWNER_DAY.initialUntil : 0);
  const [usage] = await tx.$queryRaw<{minute:bigint;hour:bigint;calls:bigint;smoke:bigint;reserved:bigint;active:bigint;in_window:boolean;receipts:SettlementReceipt[]}[]>`SELECT
    count(*) FILTER(WHERE created_at>now()-interval '1 minute') AS minute,
    count(*) FILTER(WHERE created_at>now()-interval '1 hour') AS hour,
    count(*) FILTER(WHERE created_at>=GREATEST(${start},date_trunc('day',now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')) AS calls,
    count(*) FILTER(WHERE created_at>=${start} AND output_token_cap=64) AS smoke,
    COALESCE(sum(COALESCE(reserved_nano,CASE WHEN output_token_cap=300 THEN 47300000::bigint ELSE 369512000::bigint END)) FILTER(WHERE created_at>=GREATEST(${start},date_trunc('day',now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')),0)::bigint AS reserved,
    COALESCE(jsonb_agg(jsonb_build_object('model',model,'pricingVersion',pricing_version,'kind',call_kind,'outputCap',output_token_cap,'reserve',reserved_nano::text,'cost',actual_cost_nano::text,'responseId',provider_response_id,'usage',actual_usage)) FILTER(WHERE usage_state='verified' AND created_at>=GREATEST(${start},date_trunc('day',now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')),'[]'::jsonb) AS receipts,
    count(*) FILTER(WHERE (usage_state='reserved' OR lease_until>now() OR lease_until=${legacy}) AND NOT (
      id='a7d2c6a5-affb-4ec2-a66f-4a765837db99'::uuid
      AND organization_id='2157bde1-1994-465b-9f80-e1b740ee3cb1'::uuid
      AND membership_id='c580c434-53c7-4f37-a388-da443c4e426e'::uuid
      AND created_at='2026-10-21T19:07:58.148Z'::timestamptz AND created_at<now()-interval '5 minutes'
      AND input_bytes=5743 AND output_token_cap=300 AND call_kind='review'
      AND model='gpt-6.1-sol' AND pricing_version='gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00'
      AND reserved_nano=47300000 AND usage_state='reserved'
      AND actual_usage IS NULL AND actual_cost_nano IS NULL AND provider_response_id IS NULL
      AND lease_until='2026-10-25T19:00:00Z'::timestamptz
      AND EXISTS(SELECT 1 FROM public.assistant_retained_unknown r WHERE r.attempt_id=assistant_provider_attempts.id
        AND r.retained_nano=47300000 AND r.reason='owner_approved_retained_unknown_20261021')
    )) AS active,
    (now()>=${start} AND now()<${until}) AS in_window
    FROM assistant_provider_attempts WHERE organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid`;
  try { usage.reserved=settledDailyDebit(usage.reserved,usage.receipts); }
  catch { throw new AssistantError('Учёт расхода требует проверки. Новый запрос к модели не отправлен.',503); }
  return usage;
}
export async function assertProviderTurnBudget(scope: ProviderScope) {
  const config = ownerTestConfig(), policy = ownerTestPolicy();
  if (!config || scope.organizationId !== config.organizationId || scope.membershipId !== config.membershipId) throw new AssistantError('Личный тест недоступен.',403);
  const usage = await readUsage(db,scope,new Date(config.start),new Date(config.until));
  assertTurnAdmission(usage,policy);
}
export async function reserveProviderCall(scope:ProviderScope,inputBytes:number,outputTokens:number){
  const config=ownerTestConfig(), policy=ownerTestPolicy();
  if(!config)throw new AssistantError('Личный тест не включён или его время истекло.',503);
  if(scope.organizationId!==config.organizationId||scope.membershipId!==config.membershipId)throw new AssistantError('Доступ к личному тесту запрещён.',403);
  if(scope.activationSmoke && ownerMainRestricted())throw new AssistantError('Повторный проверочный вызов не разрешён.',403);
  if(scope.activationSmoke && (!ownerMainRestricted() || outputTokens!==64))throw new AssistantError('Проверочный вызов недоступен.',403);
  if(ownerMainRestricted() && !scope.activationSmoke && ![1400,300].includes(outputTokens))throw new AssistantError('Недопустимый лимит вызова.',413);
  if(!Number.isInteger(inputBytes)||inputBytes<1||inputBytes>policy.planningBytes||!Number.isInteger(outputTokens)||outputTokens<1||outputTokens>policy.planningOutput)throw new AssistantError('Запрос превышает лимит модели.',413);
  const review=outputTokens===300;
  const snapshot={model:policy.model,pricingVersion:policy.priceAck,inputCap:review?policy.reviewInputEstimate:policy.planningInputEstimate,outputCap:outputTokens,reservedNano:BigInt(review?policy.reviewReservationNano:policy.reservationNano)};
  ledgerPrice(snapshot.pricingVersion,snapshot.model);
  const kind=review?'review':scope.activationSmoke?'smoke':'planning';
  const id=randomUUID(),start=new Date(config.start),until=new Date(config.until);
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+scope.organizationId},0))`;
    const member=await tx.organizationMembership.findFirst({where:{id:scope.membershipId,organizationId:scope.organizationId,status:'ACTIVE',role:'OWNER',organization:{status:'ACTIVE'}},select:{id:true}});
    if(!member)throw new AssistantError('Доступ к помощнику недоступен.',403);
    if(scope.customerTurnId){
      const {customerConfig}=await import('../telegram/customer-config');const cfg=customerConfig();if(!cfg)throw new AssistantError('Customer mode unavailable',403);
      const allowed=await tx.$queryRaw<{id:string}[]>`SELECT t.id FROM assistant_telegram_customer_turns t JOIN assistant_telegram_customers c ON c.id=t.binding_id WHERE t.id=${scope.customerTurnId}::uuid AND t.kind='dialogue' AND t.state IN ('planning','review_running') AND t.expires_at>now() AND c.organization_id=${scope.organizationId}::uuid AND c.budget_membership_id=${scope.membershipId}::uuid AND c.branch_id=${cfg.branchId}::uuid AND c.enabled AND c.consent_version=${cfg.consentVersion} AND c.consent_at IS NOT NULL AND c.expires_at>now()`;
      if(allowed.length!==1)throw new AssistantError('Customer attempt denied',403);
    }
    const usage=await readUsage(tx,scope,start,until);
    if(!usage.in_window)throw new AssistantError('Время личного теста истекло.',503);
    if(scope.activationSmoke && usage.smoke!==BigInt(0))throw new AssistantError('Проверочный вызов уже был учтён; повтор запрещён.',429);
    if(usage.minute>=BigInt(policy.minuteCalls)||usage.hour>=BigInt(policy.calls)||usage.calls>=BigInt(policy.calls)||usage.active>=BigInt(1)||usage.reserved+snapshot.reservedNano>BigInt(policy.budgetNano))throw new AssistantError('Лимит личного теста исчерпан или предыдущий вызов не подтверждён.',429);
    if(scope.customerTurnId){
    await tx.$executeRaw`INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap,model,pricing_version,call_kind,reserved_nano,usage_state,telegram_customer_turn_id) VALUES (${id}::uuid,${scope.organizationId}::uuid,${scope.membershipId}::uuid,now(),${until},${inputBytes},${outputTokens},${snapshot.model},${snapshot.pricingVersion},${kind},${snapshot.reservedNano},'reserved',${scope.customerTurnId??null}::uuid)`;
    }else{
    await tx.$executeRaw`INSERT INTO assistant_provider_attempts(id,organization_id,membership_id,created_at,lease_until,input_bytes,output_token_cap,model,pricing_version,call_kind,reserved_nano,usage_state) VALUES (${id}::uuid,${scope.organizationId}::uuid,${scope.membershipId}::uuid,now(),${until},${inputBytes},${outputTokens},${snapshot.model},${snapshot.pricingVersion},${kind},${snapshot.reservedNano},'reserved')`;
    }
  });
  return async(response:unknown)=>{
    // Captured tariff, never current environment. No usage means no lease release.
    const verified=verifiedLedgerUsage(response,snapshot),payload=JSON.stringify(verified.usage);
    await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+scope.organizationId},0))`;
      const changed=await tx.$executeRaw`UPDATE assistant_provider_attempts SET lease_until=now(),usage_state='verified',actual_usage=${payload}::jsonb,actual_cost_nano=${verified.cost},provider_response_id=${verified.responseId} WHERE id=${id}::uuid AND organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid AND usage_state='reserved' AND model=${snapshot.model} AND pricing_version=${snapshot.pricingVersion} AND reserved_nano=${snapshot.reservedNano}`;
      if(changed===1)return;
      // Idempotent receipt persistence after lost acknowledgement, never provider retry.
      const [same]=await tx.$queryRaw<{ok:boolean}[]>`SELECT (usage_state='verified' AND provider_response_id=${verified.responseId} AND actual_usage=${payload}::jsonb AND actual_cost_nano=${verified.cost} AND model=${snapshot.model} AND pricing_version=${snapshot.pricingVersion} AND reserved_nano=${snapshot.reservedNano}) AS ok FROM assistant_provider_attempts WHERE id=${id}::uuid AND organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid`;
      if(!same?.ok)throw new AssistantError('Подтверждение расхода не сохранено. Повтор вызова остановлен.',502);
    });
  };
}
