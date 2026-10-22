import 'server-only';
import {db} from '@/lib/db';
import {customerConfig} from './customer-config';
import type {TelegramScope} from './adapter';
import type {Prisma} from '@/generated/prisma/client';
export async function authorizeCustomer(scope:TelegramScope,tx:Prisma.TransactionClient=db){
 const cfg=customerConfig();
 if(!cfg||scope.organizationId!==cfg.organizationId||scope.membershipId!==cfg.membershipId||scope.branchId!==cfg.branchId||!scope.enabled||!scope.consent||Date.now()<scope.start||Date.now()>=scope.until||scope.until>cfg.until)throw Error('CUSTOMER_DENIED');
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM assistant_telegram_customers WHERE organization_id=${scope.organizationId}::uuid AND budget_membership_id=${cfg.membershipId}::uuid AND branch_id=${cfg.branchId}::uuid AND bot_id=${scope.botId} AND sender_id=${scope.userId} AND chat_id=${scope.chatId} AND chat_id=sender_id AND generation=${scope.generation}::uuid AND enabled=true AND consent_at IS NOT NULL AND consent_version=${cfg.consentVersion} AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()`;
 const branch=await tx.branch.findFirst({where:{id:cfg.branchId,organizationId:cfg.organizationId,isPublic:true,status:'ACTIVE',organization:{status:'ACTIVE'}},select:{id:true}});
 if(rows.length!==1||!branch)throw Error('CUSTOMER_DENIED');
 // membershipId is the server-owned BILLING envelope only; no staff privileges granted.
}
