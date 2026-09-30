import type { Metadata } from "next";
import { publicBranches } from "@/lib/showroom/service";
import { Showroom } from "./Showroom";
import "./showroom.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MARIPOSA — аренда", robots: { index: false, follow: false } };
export default async function ShowroomPage() {
  let branches;
  try { branches = await publicBranches(); }
  catch { return <main className="showroom"><h1>MARIPOSA</h1><p>Витрина пока недоступна. Попробуйте позже.</p></main>; }
  return <main className="showroom"><h1>MARIPOSA — аренда</h1>
    <p>Выберите филиал, размер и даты. Сотрудник проверит заявку и свяжется с вами. Отправка заявки не бронирует товар.</p>
    {branches.length ? <Showroom branches={branches} /> : <p>Публичные филиалы пока не открыты.</p>}
  </main>;
}
