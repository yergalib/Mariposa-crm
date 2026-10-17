import { HISTORY_OPEN } from './contracts';
import { PUBLIC_INQUIRY_INTAKE_OPEN } from '@/lib/showroom/release';
import { isolatedHistoryEnabled, isolatedPreviewRequested } from '../isolated-preview';
import { PILOT_TEST, pilotTestConfigured, pilotTestRequested } from '../pilot-test-config';
export function historyEnabled(organizationId?: string) {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (pilotTestRequested()) return pilotTestConfigured() && (organizationId === undefined || organizationId === PILOT_TEST.organizationId);
  if (isolatedPreviewRequested()) return isolatedHistoryEnabled(organizationId);
  return HISTORY_OPEN;
}
export function historyHandoffEnabled(organizationId?: string) {
  if (!historyEnabled(organizationId)) return false;
  if (pilotTestRequested()) return pilotTestConfigured();
  return isolatedPreviewRequested() ? isolatedHistoryEnabled(organizationId) : PUBLIC_INQUIRY_INTAKE_OPEN;
}
