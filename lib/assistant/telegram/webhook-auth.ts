import 'server-only';
import {timingSafeEqual} from 'node:crypto';
export function authenticateWebhook(expected:string|undefined,received:string|null){
  if(!expected||expected.length<32||!received||received.length>256)throw new Error('Telegram webhook denied');
  const a=Buffer.from(expected),b=Buffer.from(received);
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('Telegram webhook denied');
}
