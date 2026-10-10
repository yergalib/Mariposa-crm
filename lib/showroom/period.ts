import { parseBusinessLocalDateTime } from '@/lib/calendar/timezone';
export const PERIOD_HINT='Выберите будущий период до 31 дня, не далее года вперёд. Укажите обе даты и время; время местное для филиала.';
export function rentalPeriod(fromValue:string,untilValue:string,timezone:string,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fromValue)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(untilValue))throw new Error(PERIOD_HINT);
 const from=parseBusinessLocalDateTime(fromValue,timezone),until=parseBusinessLocalDateTime(untilValue,timezone);
 if(from.getTime()<now||from.getTime()>now+366*86400000||until<=from||until.getTime()-from.getTime()>31*86400000)throw new Error(PERIOD_HINT);
 return {from,until};
}
export function branchCivilDay(timezone:string,now:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const part=(name:string)=>parts.find(p=>p.type===name)!.value;return part('year')+'-'+part('month')+'-'+part('day')}
