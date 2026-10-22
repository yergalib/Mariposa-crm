import 'server-only';
import {ownerDayConfig} from '../owner-day-config';
export const CUSTOMER_CONSENT_VERSION='telegram-catalog-openai-v1';
export function customerConfig(env:NodeJS.ProcessEnv=process.env){
 if(env.MARIPOSA_TELEGRAM_MODE!=='customer-test-v1')return null;
 const owner=ownerDayConfig(env);if(!owner)return null;
 const branchId=env.MARIPOSA_TELEGRAM_CUSTOMER_BRANCH_ID;
 const minute=Number(env.MARIPOSA_TELEGRAM_CUSTOMER_MINUTE_TURNS),day=Number(env.MARIPOSA_TELEGRAM_CUSTOMER_DAY_TURNS);
 if(!branchId||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(branchId)||!Number.isInteger(minute)||minute<1||minute>10||!Number.isInteger(day)||day<1||day>100)return null;
 return {...owner,branchId,minute,day,consentVersion:CUSTOMER_CONSENT_VERSION};
}
