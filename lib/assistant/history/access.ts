import { HISTORY_OPEN } from './contracts';
import { PUBLIC_INQUIRY_INTAKE_OPEN } from '@/lib/showroom/release';
import { isolatedHistoryEnabled, isolatedPreviewRequested } from '../isolated-preview';
export function historyEnabled(organizationId?: string) {
  if (process.env.VERCEL_ENV === 'production') return false;
  if (isolatedPreviewRequested()) return isolatedHistoryEnabled(organizationId);
  return HISTORY_OPEN;
}
export function historyHandoffEnabled(organizationId?: string) {
  if (!historyEnabled(organizationId)) return false;
  return isolatedPreviewRequested() ? isolatedHistoryEnabled(organizationId) : PUBLIC_INQUIRY_INTAKE_OPEN;
}
