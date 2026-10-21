// Same idempotency key for the original POST and every continuation/poll.
// Network errors propagate: never automatically re-send paid planning.
const storageKey='mariposa-owner-assistant-pending-v1',changeEvent='mariposa-owner-assistant-pending-change';
let memoryKey:string|null=null;
export function readPendingTurn(){try{return sessionStorage.getItem(storageKey);}catch{return memoryKey;}}
export function writePendingTurn(key:string|null){memoryKey=key;try{if(key)sessionStorage.setItem(storageKey,key);else sessionStorage.removeItem(storageKey);}catch{/* in-memory recovery remains available */}window.dispatchEvent(new Event(changeEvent));}
export function subscribePendingTurn(listener:()=>void){window.addEventListener(changeEvent,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(changeEvent,listener);window.removeEventListener('storage',listener);};}
export async function requestContinuedTurn(payload:unknown,key:string,resume:boolean,signal:AbortSignal,transport:typeof fetch=fetch){
 let body=resume?{resumeKey:key}:payload;
 for(let poll=0;poll<30;poll++){
  const response=await transport('/api/showroom/assistant',{method:'POST',headers:{'Content-Type':'application/json','x-assistant-turn':key},body:JSON.stringify(body),cache:'no-store',signal});
  if(response.status!==202)return response;
  const pending=await response.json();
  if(pending.continuation?.status!=='pending'||pending.continuation.key!==key)throw new Error('Не удалось подтвердить продолжение запроса. Повтора нет.');
  body={resumeKey:key};
  await new Promise<void>((resolve,reject)=>{
   if(signal.aborted){reject(new Error('Ожидание остановлено.'));return;}
   const stop=()=>{clearTimeout(timer);reject(new Error('Ожидание остановлено.'));};
   const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},1000);
   signal.addEventListener('abort',stop,{once:true});
  });
 }
 throw new Error('Проверка ещё выполняется. Можно проверить результат без повторной отправки.');
}
