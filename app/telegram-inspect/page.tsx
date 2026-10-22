import {requireOwnerDaySession} from '@/lib/assistant/owner-day-access';
export const dynamic='force-dynamic';
export default async function TelegramInspectPage(){
  await requireOwnerDaySession();
  return <main><h1>Проверка существующего Telegram-бота</h1>
    <p>Только чтение имени бота и состояния подключения. Без сообщений, изменения webhook или вызовов ИИ. Токен остаётся на сервере.</p>
    <form action="/api/telegram/inspect" method="post"><button type="submit">Проверить бота — только чтение</button></form>
  </main>;
}
