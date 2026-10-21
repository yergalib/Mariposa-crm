import 'server-only';
import { PUBLIC_INQUIRY_INTAKE_OPEN } from './release';
import { ownerMainRestricted } from '@/lib/assistant/owner-day-config';
import { requireOwnerDaySession } from '@/lib/assistant/owner-day-access';
import { AssistantError } from '@/lib/assistant/chat/limits';

export async function requireInquiryIntake() {
  if (ownerMainRestricted()) return requireOwnerDaySession(['LEAD_VIEW', 'LEAD_CREATE']);
  if (!PUBLIC_INQUIRY_INTAKE_OPEN) throw new AssistantError('Онлайн-отправка заявок пока не открыта.', 503);
  return null;
}
