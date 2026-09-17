import { AppShell } from "@/components/AppShell";
import { EmptyState, SectionCard } from "@/components/ui";
export default function Page(){return <AppShell active="/whatsapp" title="Чаты" subtitle="Единый центр общения с клиентами"><SectionCard><EmptyState title="Чаты пока не подключены" description="Здесь появятся диалоги из Telegram, WhatsApp и Instagram. Текущий адрес сохранён для совместимости."/></SectionCard></AppShell>}
