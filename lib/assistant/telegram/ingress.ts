import {timingSafeEqual} from 'node:crypto';
import {telegramConfig,TELEGRAM_INGRESS_HOST} from './config';
export function telegramIngressDecision(request:Request,env:NodeJS.ProcessEnv=process.env):'unrelated'|'deny'|'webhook'{
  const url=new URL(request.url),host=(request.headers.get('host')??'').toLowerCase();
  // Never use Forwarded/X-Forwarded-Host to select or authenticate this ingress.
  if(url.hostname!==TELEGRAM_INGRESS_HOST&&host!==TELEGRAM_INGRESS_HOST)return 'unrelated';
  if(url.protocol!=='https:'||url.host!==TELEGRAM_INGRESS_HOST||host!==TELEGRAM_INGRESS_HOST
    ||request.method!=='POST'||url.pathname!=='/api/telegram/webhook'||url.search)return 'deny';
  const config=telegramConfig(env);if(!config)return 'deny';
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return 'deny';
  const received=request.headers.get('x-telegram-bot-api-secret-token');
  if(!received||received.length>256)return 'deny';
  const a=Buffer.from(received),b=Buffer.from(config.secret);
  return a.length===b.length&&timingSafeEqual(a,b)?'webhook':'deny';
}
