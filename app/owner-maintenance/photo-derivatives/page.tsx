import { repairStatus } from '@/lib/catalog/approved-derivatives-repair';

export const dynamic = 'force-dynamic';
export default async function DerivativeRepairPage() {
  const rows = await repairStatus();
  const present = rows.flatMap(row => row.derivatives).filter(row => row.exists).length;
  return <main>
    <h1>Восстановление согласованных версий фотографий</h1>
    <p>62 оригинала. Найдено {present} из 124 версий для сайта и каталога.</p>
    <p>Один запуск обрабатывает один оригинал. Оригиналы и привязки не изменяются.
      После запуска сохраните JSON-отчёт. При ошибке сначала проверьте состояние.</p>
    <form method="post" action="/api/owner-maintenance/photo-derivatives">
      <button type="submit" disabled={present === 124}>Обработать следующий оригинал</button>
    </form>
    <a href="/api/owner-maintenance/photo-derivatives">Проверить manifest без записи</a>
  </main>;
}
