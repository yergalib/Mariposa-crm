import {notFound} from 'next/navigation';
import {telegramConfig} from '@/lib/assistant/telegram/config';
import {requireOwnerDaySession} from '@/lib/assistant/owner-day-access';
import {publicBranches} from '@/lib/showroom/service';
import TelegramOwnerPanel from './panel';
export const dynamic='force-dynamic';
export default async function TelegramPage(){
  if(!telegramConfig())notFound();
  await requireOwnerDaySession();
  return <main><h1>Telegram — закрытый тест владельца</h1><TelegramOwnerPanel branches={await publicBranches()}/></main>;
}
