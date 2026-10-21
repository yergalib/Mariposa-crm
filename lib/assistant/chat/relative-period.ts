import { branchCivilDay, rentalPeriod, returnDate, rentalPeriodLabel, RENTAL_CONDITIONS, PERIOD_HINT } from '@/lib/showroom/period';
import { explicitSizeEvidence } from './explicit-size-evidence';
import type { OutfitContext } from './outfit-contracts';
export function rentalExceptionRequest(text:string){return !/примерк/iu.test(text) && /(?:(?<![а-я])(?:ранн|поздн)|до\s*15|после\s*12|утром|ночью|вечером.*вер|вер.*вечером)|\d{1,2}:\d{2}/iu.test(text)}
export function applyRelativePeriod(context:OutfitContext,latest:string,previous:string,branch:{id:string;timezone:string}|undefined,now=Date.now()){
 if(!branch)return null;
 if(rentalExceptionRequest(latest))return {message:'Нестандартное время выдачи или возврата нужно согласовать с сотрудником. Исключение не подтверждено. '+RENTAL_CONDITIONS,complete:false};
 const text=latest.toLowerCase().replaceAll('ё','е');
 if(/\?|(?:^|\s)(?:нет|не|кроме|без|или)\s|может|наверн/iu.test(text))return null;
 const today=branchCivilDay(branch.timezone,now),year=today.slice(0,4);
 const range=/^\s*(\d{1,2})\.(\d{1,2})\.?\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\.?\s*$/u.exec(text);
 const isoRange=/^\s*(\d{4}-\d{2}-\d{2})\s*[-–—]\s*(\d{4}-\d{2}-\d{2})\s*$/u.exec(text);
 const rel=/(?<![а-я])(послезавтра|завтра|сегодня)(?![а-я])/u.exec(text);
 const date=/(?<!\d)(\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4})(?!\d)/u.exec(text);
 const duration=/на\s+(?:(\d{1,2}|один|два|три)\s+)?(?:день|дня|дней|сутки|суток)(?![а-я])/u.exec(text);
 const days=duration?Number(({один:1,два:2,три:3} as Record<string,number>)[duration[1]]??duration[1]??1):0;
 let start='',end='';
 if(range){start=`${year}-${range[2].padStart(2,'0')}-${range[1].padStart(2,'0')}`;end=`${year}-${range[4].padStart(2,'0')}-${range[3].padStart(2,'0')}`}
 else if(isoRange){start=isoRange[1];end=isoRange[2]}
 else if((rel||date)&&duration){try{start=rel?(rel[1]==='сегодня'?today:returnDate(today,rel[1]==='завтра'?1:2)):date![1].includes('-')?date![1]:date![1].split(/[./]/).reverse().join('-');end=returnDate(start,days)}catch{return {message:PERIOD_HINT,complete:false}}}
 else return null;
 let period;try{period=rentalPeriod(start,end,branch.timezone,now)}catch{return {message:PERIOD_HINT,complete:false}};
 context.from=period.fromLocal;context.until=period.untilLocal;context.calendarPeriod=false;delete context.dateDraft;delete context.nextSearch;delete context.recentCards;
 const size=latest.match(/размер\s*[:—-]?\s*(\d{2,3})(?!\d)/iu)?.[1];if(size&&explicitSizeEvidence(size,latest,previous,context.activeSlot,context.activeSlot))context.criteria[context.activeSlot].size=size;
 const height=text.match(/рост\s*[:—-]?\s*(\d{2,3})(?!\d)/u)?.[1];if(height&&+height>=40&&+height<=220)context.heightCm=+height;
 return {message:rentalPeriodLabel(context.from,context.until)+'. '+RENTAL_CONDITIONS,complete:true};
}
