import 'server-only';
import {customerConfig} from './customer-config';
import {ownerDayConfig} from '../owner-day-config';
export const TELEGRAM_INGRESS_HOST='mariposa-telegram-owner-test-mariposa-crm.vercel.app';
// Token storage is NOT activation. Absent mode returns before secrets/DB/network.
export function telegramConfig(env:NodeJS.ProcessEnv=process.env){
  if(!['owner-test-v1','customer-test-v1'].includes(env.MARIPOSA_TELEGRAM_MODE??'')||env.MARIPOSA_TELEGRAM_INGRESS_HOST!==TELEGRAM_INGRESS_HOST)return null;
  if(env.MARIPOSA_TELEGRAM_MODE==='customer-test-v1'&&!customerConfig(env))return null;
  if(!ownerDayConfig(env))return null;
  const token=env.MARIPOSA_TELEGRAM_BOT_TOKEN,secret=env.MARIPOSA_TELEGRAM_WEBHOOK_SECRET;
  const botId=Number(env.MARIPOSA_TELEGRAM_BOT_ID);
  if(!token||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token)||!secret||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)
    ||!Number.isSafeInteger(botId)||botId<=0||Number(token.split(':')[0])!==botId)return null;
  return {token,secret,botId};
}
