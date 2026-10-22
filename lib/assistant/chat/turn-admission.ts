import { AssistantError } from './limits';
type Usage={in_window:boolean;active:bigint;calls:bigint;reserved:bigint};
type Policy={reservationNano:number;reviewReservationNano:number;calls:number;budgetNano:number};
const dollars=(nano:bigint)=>(Number(nano)/1e9).toFixed(6);
export function assertTurnAdmission(usage:Usage,policy:Policy){
 const wholeTurn=BigInt(3*policy.reservationNano+policy.reviewReservationNano);
 if(!usage.in_window)throw new AssistantError('Срок закрытого теста завершён. Новый запрос к модели не отправлен.',429);
 if(usage.active>BigInt(0))throw new AssistantError('Предыдущий вызов модели ещё выполняется или его исход не подтверждён. Новый запрос не отправлен; повторять его пока нельзя.',429);
 if(usage.calls+BigInt(4)>BigInt(policy.calls))throw new AssistantError('Оставшегося дневного числа вызовов недостаточно для полного ответа с проверкой. Новый запрос к модели не отправлен.',429);
 if(usage.reserved+wholeTurn>BigInt(policy.budgetNano)){
  const available=BigInt(policy.budgetNano)>usage.reserved?BigInt(policy.budgetNano)-usage.reserved:BigInt(0);
  throw new AssistantError('Недостаточно дневного бюджета ИИ: доступно $'+dollars(available)+', для полного ответа с проверкой требуется $'+dollars(wholeTurn)+'. Учтены подтверждённый расход и запас под незавершённые вызовы. Новый запрос к модели не отправлен. Дневной лимит обновится в 00:00 по Астане.',429);
 }
}
