import type { Metadata } from "next";
import { publicBranches } from "@/lib/showroom/service";
import { Showroom } from "./Showroom";
import { ShowroomFrame } from "./ShowroomPresentation";
import "./showroom.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MARIPOSA — аренда", robots: { index: false, follow: false } };
export default async function ShowroomPage() {
  let branches;
  try { branches = await publicBranches(); }
  catch { return <ShowroomFrame><p className="showroom-empty">Витрина пока недоступна. Попробуйте позже.</p></ShowroomFrame>; }
  return <ShowroomFrame>
    {branches.length ? <Showroom branches={branches} /> : <p>Публичные филиалы пока не открыты.</p>}
  </ShowroomFrame>;
}
