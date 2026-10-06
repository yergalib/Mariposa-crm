import {z} from "zod";
export const SOURCES=["CRM","WEBSITE","PHONE","WHATSAPP","INSTAGRAM","IMPORT","OTHER"] as const;
const opt=(n:number)=>z.string().trim().max(n).nullable().optional().transform(v=>v||null);
export const customerSchema=z.object({firstName:z.string().trim().min(1).max(100),lastName:opt(100),middleName:opt(100),birthDate:z.string().nullable().optional().transform(v=>v?new Date(`${v}T00:00:00.000Z`):null),preferredLanguage:opt(20),source:z.enum(SOURCES),status:z.enum(["ACTIVE","BLOCKED","ARCHIVED"]).default("ACTIVE"),marketingConsent:z.boolean().default(false)});
export const contactSchema=z.object({type:z.enum(["PHONE","EMAIL","OTHER"]),value:z.string().trim().min(1).max(254),label:opt(60),isPrimary:z.boolean().default(false),isVerified:z.boolean().default(false)}).superRefine((contact,ctx)=>{
  if(contact.type==="PHONE"&&(!/^\+?[0-9() .\-\u00a0]+$/.test(contact.value)||!/^\d{7,15}$/.test(contact.value.replace(/\D/g,""))))
    ctx.addIssue({code:"custom",path:["value"],message:"Телефон: укажите 7–15 цифр, необязательный + в начале, пробелы, скобки или дефисы."});
  if(contact.type==="EMAIL"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact.value))
    ctx.addIssue({code:"custom",path:["value"],message:"Укажите email в формате name@example.com."});
});
export const addressSchema=z.object({type:z.string().trim().min(1).max(30),country:opt(80),city:opt(100),addressLine:z.string().trim().min(1).max(500),comment:opt(500),isPrimary:z.boolean().default(false)});
export const noteSchema=z.object({text:z.string().trim().min(1).max(4000)});
