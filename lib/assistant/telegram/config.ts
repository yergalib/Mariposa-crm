import 'server-only';
import {ownerDayConfig} from '../owner-day-config';
export const TELEGRAM_INGRESS_HOST='mariposa-telegram-owner-test-mariposa-crm.vercel.app';
// Token storage is NOT activation. Absent mode returns before secrets/DB/network.
export function telegramConfig(env:NodeJS.ProcessEnv=process.env){
  if(env.MARIPOSA_TELEGRAM_MODE!=='owner-test-v1'||env.MARIPOSA_TELEGRAM_INGRESS_HOST!==TELEGRAM_INGRESS_HOST)return null;
  if(!ownerDayConfig(env))return null;
  const token=env.MARIPOSA_TELEGRAM_BOT_TOKEN,secret=env.MARIPOSA_TELEGRAM_WEBHOOK_SECRET;
  const botId=Number(env.MARIPOSA_TELEGRAM_BOT_ID);
  if(!token||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token)||!secret||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)
    ||!Number.isSafeInteger(botId)||botId<=0||Number(token.split(':')[0])!==botId)return null;
  return {token,secret,botId};
}
