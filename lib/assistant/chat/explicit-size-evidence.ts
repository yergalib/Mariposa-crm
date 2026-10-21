import type { OutfitSlot } from './outfit-contracts';
// Evidence guard, not a dialogue parser: the model proposes a value; full user context
// must independently identify a positive label/size and the intended outfit slot.
export function explicitSizeEvidence(value:string,latest:string,previous:string,slot:OutfitSlot,activeSlot:OutfitSlot):boolean {
 if(!value.trim())return false;
 const namedSlots=(text:string):OutfitSlot[]=>[
  ...(/плать|наряд|юбк/iu.test(text)?['dress' as const]:[]),
  ...(/обув|туфл|босонож|сапог|ботин|кроссов/iu.test(text)?['shoes' as const]:[]),
  ...(/аксессуар|ободок|кольц/iu.test(text)?['accessory' as const]:[]),
 ];
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const token=new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`,'iu');
 // Bind THIS value to its size/label marker; another number in the same clause is not evidence.
 const marker='(?:размер(?:а)?(?:\\s+(?:платья|обуви|аксессуара))?|ношу|носит|на\\s+бирке(?:\\s+размер)?|бирка(?:\\s+размер)?)';
 const labelledValue=new RegExp(`(?<![\\p{L}\\p{N}])${marker}\\s*[:=—-]?\\s*${escape(value)}(?![\\p{L}\\p{N}])`,'iu');
 const valueOnLabel=new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}\\s*(?:[—:-]\\s*)?на\\s+бирке(?![\\p{L}\\p{N}])`,'iu');
 const negative=new RegExp(`(?:не|кроме|без)\\s*(?:размер[а-я]*\\s*)?${escape(value)}(?![\\p{L}\\p{N}])`,'iu');
 if(negative.test(latest)||/бирк[ауе][^.!?;\n]{0,25}не\s+(?:смотр|вид|провер|чит)|не\s+(?:смотр|вид|провер|чит)[^.!?;\n]{0,25}бирк/iu.test(latest))return false;
 if(latest.trim()===value && /^\d{2,3}$/.test(value) && /размер/iu.test(previous)) {
  const slots=namedSlots(previous);return slots.length===1?slots[0]===slot:slots.length===0&&slot===activeSlot;
 }
 const clauses=latest.split(/[.!;,\n]/u).filter(c=>token.test(c)||labelledValue.test(c));
 return clauses.some(clause=>{
  if(/(?:^|\s)(?:не|нет|кроме|без)(?:\s|$)/iu.test(clause))return false;
  if(/\?|наверн|кажется|думаю|может|примерно|получается|предполага|по\s+рост|из\s+рост|судя\s+по/iu.test(clause))return false;
  if(!labelledValue.test(clause)&&!valueOnLabel.test(clause))return false;
  const slots=namedSlots(clause);return slots.length===1?slots[0]===slot:slots.length===0&&slot===activeSlot;
 });
}
