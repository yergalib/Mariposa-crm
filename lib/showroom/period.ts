import { parseBusinessLocalDateTime, parseDateKey, addLocalDays, dateKey } from '@/lib/calendar/timezone';
export const RENTAL_CONDITIONS = 'Выдача с 15:00 до 20:00, возврат до 12:00 указанной даты. Исключения согласует сотрудник. Бронь подтверждается отдельно.';
export const PERIOD_HINT = 'Выберите дату выдачи и дату возврата: от 1 до 31 дня, не далее года вперёд. Выдачу сегодня после 20:00 согласуйте с сотрудником.';
export function branchCivilDay(timezone:string,now:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const part=(name:string)=>parts.find(p=>p.type===name)!.value;return part('year')+'-'+part('month')+'-'+part('day')}
export function rentalDate(value:string){return value.slice(0,10)}
export function returnDate(start:string,days:number){const d=parseDateKey(start);if(!d||!Number.isInteger(days)||days<1||days>31)throw new Error(PERIOD_HINT);return dateKey(addLocalDays(d,days))}
export function rentalPeriod(fromValue:string,untilValue:string,timezone:string,now=Date.now()){
 const fromDay=rentalDate(fromValue),untilDay=rentalDate(untilValue),start=parseDateKey(fromDay),end=parseDateKey(untilDay);
 // Date-only requests and canonical internal values share exactly one policy.
 if(!start||!end||![fromDay,fromDay+'T15:00'].includes(fromValue)||![untilDay,untilDay+'T12:00'].includes(untilValue))throw new Error(PERIOD_HINT);
 const days=(Date.parse(untilDay)-Date.parse(fromDay))/86400000,today=branchCivilDay(timezone,now);
 if(days<1||days>31||fromDay<today||fromDay>returnDateHorizon(today)|| (fromDay===today&&now>=parseBusinessLocalDateTime(today+'T20:00',timezone).getTime()))throw new Error(PERIOD_HINT);
 // Keep15:00 even when requesting today after15:00: conservative overlap with existing bookings.
 const from=parseBusinessLocalDateTime(fromDay+'T15:00',timezone),until=parseBusinessLocalDateTime(untilDay+'T12:00',timezone);
 return {from,until,fromLocal:fromDay+'T15:00',untilLocal:untilDay+'T12:00',days,fromDay,untilDay};
}
function returnDateHorizon(today:string){return dateKey(addLocalDays(parseDateKey(today)!,366))}
export function rentalPeriodLabel(from:string,until:string){const label=(v:string)=>rentalDate(v).split('-').reverse().join('.');
 if((from.length>10&&!from.endsWith('T15:00'))||(until.length>10&&!until.endsWith('T12:00')))return `Сохранённые даты: ${label(from)} — ${label(until)}. Выберите даты заново по стандартным условиям.`;
 return `Выдача ${label(from)} · возврат ${label(until)} до 12:00`}
