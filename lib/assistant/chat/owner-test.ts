import 'server-only';
import { isolatedPreviewRequested } from '../isolated-preview';
import { pilotTestRequested } from '../pilot-test-config';
import { z } from 'zod';
import { HISTORY_OPEN } from '../history/contracts';
import { PUBLIC_INQUIRY_INTAKE_OPEN } from '@/lib/showroom/release';
import { OWNER_DAY, ownerDayConfig, ownerMainRestricted } from '../owner-day-config';
// Approved smoke tariff snapshot, requiring explicit re-verification before activation.
// Engineering reserve only; not a provider billing hard cap.
export const OWNER_TEST = { model:'gpt-6-luna', calls:160, minuteCalls:12, durationMs:60*60_000,
  planningBytes:48_000, reviewBytes:8_000, planningInputEstimate:64_000, reviewInputEstimate:16_000,
  planningOutput:1_400, reviewOutput:300, inputNano:125, outputNano:500,
  reservationNano:9_570_000, budgetNano:1_600_000_000,
  priceAck:'gpt-6-luna:2026-10-11:0.125:0.5' } as const;
const uuid=z.string().uuid();
export function ownerTestPolicy(env: NodeJS.ProcessEnv = process.env) {
  return ownerMainRestricted(env) ? { ...OWNER_TEST, calls: OWNER_DAY.calls, minuteCalls: OWNER_DAY.minuteCalls,
    durationMs: OWNER_DAY.until - OWNER_DAY.start, planningInputEstimate: OWNER_DAY.planningInputEstimate,
    reservationNano: OWNER_DAY.reservationNano, budgetNano: OWNER_DAY.budgetNano, priceAck: OWNER_DAY.priceAck } : OWNER_TEST;
}
export function ownerTestConfig(env:NodeJS.ProcessEnv=process.env,now=Date.now()) {
  if (ownerMainRestricted(env)) return env.MARIPOSA_ASSISTANT_ENABLED === '1'
    && env.MARIPOSA_ASSISTANT_PRICE_ACK === OWNER_DAY.priceAck && !HISTORY_OPEN && !PUBLIC_INQUIRY_INTAKE_OPEN
    ? ownerDayConfig(env, now) : null;
  if (isolatedPreviewRequested(env) || pilotTestRequested(env)) return null;
  const ref=env.MARIPOSA_ASSISTANT_PREVIEW_REF, owner=env.MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID;
  // Explicit test tenant must match the existing storefront; never retarget it.
  const organizationId=env.MARIPOSA_ASSISTANT_ORGANIZATION_ID;
  const startText=env.MARIPOSA_ASSISTANT_TEST_START, endText=env.MARIPOSA_ASSISTANT_TEST_UNTIL;
  if(env.MARIPOSA_ASSISTANT_ENABLED!=='1'||env.VERCEL_ENV!=='preview'||HISTORY_OPEN||PUBLIC_INQUIRY_INTAKE_OPEN
    ||!uuid.safeParse(organizationId).success||env.STOREFRONT_ORGANIZATION_ID!==organizationId||!uuid.safeParse(owner).success
    ||!ref||!/^review\/[A-Za-z0-9._/-]+$/.test(ref)||env.VERCEL_GIT_COMMIT_REF!==ref
    ||env.MARIPOSA_ASSISTANT_PRICE_ACK!==OWNER_TEST.priceAck
    ||!startText||!endText||!z.iso.datetime().safeParse(startText).success||!z.iso.datetime().safeParse(endText).success)return null;
  const start=Date.parse(startText),until=Date.parse(endText);
  if(until<=start||until-start>OWNER_TEST.durationMs||now<start||now>=until)return null;
  return {organizationId:organizationId!,membershipId:owner!,start,until,ref};
}
