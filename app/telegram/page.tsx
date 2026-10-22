import {notFound} from 'next/navigation';
import {telegramConfig} from '@/lib/assistant/telegram/config';
import {requireOwnerDaySession} from '@/lib/assistant/owner-day-access';
import {publicBranches} from '@/lib/showroom/service';
import TelegramOwnerPanel from './panel';
import {customerConfig} from '@/lib/assistant/telegram/customer-config';
export const dynamic='force-dynamic';
export default async function TelegramPage(){
  if(!telegramConfig())notFound();
  await requireOwnerDaySession();
  const customerMode=!!customerConfig();
  return <main><h1>{customerMode ? 'Telegram — клиентский тест' : 'Telegram — закрытый тест владельца'}</h1><TelegramOwnerPanel customerMode={customerMode} branches={customerMode ? [] : await publicBranches()}/></main>;
}
