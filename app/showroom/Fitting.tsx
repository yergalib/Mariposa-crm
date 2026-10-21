"use client";
import Link from "next/link";
import { useState } from 'react';
import { useInquiryIntake } from './InquiryAccess';
import { InquiryForm } from './InquiryForm';
import type { PublicBranch } from '@/lib/showroom/contracts';
import { InquiryDraft } from "./InquiryDraft";
import { showroomContact as contact } from "./site-content";
export function Fitting({branches=[]}: {branches?: PublicBranch[]}) {
  const enabled=useInquiryIntake(), [branchId,setBranchId]=useState(branches[0]?.id ?? ''),[request,setRequest]=useState(false);
  if(enabled) return <section className="fitting-page"><Link href="/showroom?view=catalog">К каталогу</Link><h1>Запрос примерки</h1>{request ? <InquiryForm purpose="fitting" item={{id:'',name:'Примерка в MARIPOSA',execution:null,size:'уточнить',price:null,available:false}} filters={{branchId,from:'',until:'',size:'',search:''}} branchLabel={branches.find(b=>b.id===branchId)?.name ?? ''} onNewSearch={()=>setRequest(false)} /> : <><label>Филиал<select value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><p>Это обращение сотруднику, не подтверждённая запись. Даты аренды не требуются.</p><button disabled={!branchId} onClick={()=>setRequest(true)}>Запросить примерку</button></>}</section>;
  return <section className="fitting-page"><Link className="catalog-back" href="/showroom?view=catalog">← К каталогу</Link><h1>Примерка в MARIPOSA</h1><p>Обсудите платье и удобное время с сотрудником.</p><p>{contact.name} · {contact.city} · {contact.hours}</p><InquiryDraft /></section>;
}
