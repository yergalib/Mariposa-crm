import 'server-only';
import type {TelegramScope} from './adapter';
export interface DeliveryPorts {
  authorize(scope:TelegramScope):Promise<void>;
  // Atomic unsent -> sending, only for a reviewed completed turn. Scoped to the
  // same binding/update. No reclaim on timeout; sending remains uncertain.
  claim(scope:TelegramScope,key:string):Promise<boolean>;
  send(scope:TelegramScope,text:string):Promise<{messageId:number}>;
  receipt(scope:TelegramScope,key:string,messageId:number):Promise<void>;
  unknown(scope:TelegramScope,key:string):Promise<void>;
}
// No Telegram HTTP implementation is supplied. A send/receipt failure is not a
// reason to resend. Telegram does not supply our application idempotency key.
export async function deliverTelegram(scope:TelegramScope,key:string,text:string,ports:DeliveryPorts){
  if(!/^\d{1,16}$/.test(key)||!text.trim()||text.length>4096)throw new Error('Invalid Telegram delivery');
  await ports.authorize(scope);
  if(!await ports.claim(scope,key))return {status:'not_sent' as const};
  try{
    await ports.authorize(scope);
    const result=await ports.send(scope,text);
    if(!Number.isSafeInteger(result.messageId)||result.messageId<=0)throw new Error('Telegram receipt missing');
    await ports.receipt(scope,key,result.messageId);
    return {status:'sent' as const};
  }catch{
    await ports.unknown(scope,key);
    return {status:'unknown' as const};
  }
}
