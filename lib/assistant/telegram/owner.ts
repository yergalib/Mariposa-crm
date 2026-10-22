import 'server-only';
import {db} from '@/lib/db';
import {ownerDayConfig} from '../owner-day-config';
import {memberHasPermission,permissionMemberSelect} from '@/lib/permissions/member';
import type {PermissionKey} from '@/lib/permissions/registry';
import type {TelegramScope} from './adapter';

// Telegram is a separately approved identity binding, NOT an invented WEB session.
// No React/session cache: each processing phase checks fresh membership/binding.
export async function authorizeTelegramOwner(scope:TelegramScope,handoff=false){
  const config=ownerDayConfig();
  if(!config||!scope.enabled||!scope.consent||scope.organizationId!==config.organizationId
    ||scope.membershipId!==config.membershipId||scope.start<config.start||scope.until>config.until
    ||Date.now()<scope.start||Date.now()>=scope.until)throw new Error('Telegram owner window denied');
  const binding=await db.$queryRaw<{id:string}[]>`SELECT id FROM assistant_telegram_bindings
    WHERE organization_id=${scope.organizationId}::uuid AND membership_id=${scope.membershipId}::uuid
    AND branch_id=${scope.branchId}::uuid AND bot_id=${scope.botId} AND sender_id=${scope.userId}
    AND chat_id=${scope.chatId} AND chat_id=sender_id AND generation=${scope.generation}::uuid
    AND enabled=true AND consent_at IS NOT NULL AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()
    AND starts_at>=${new Date(config.start)} AND expires_at<=${new Date(config.until)}`;
  if(binding.length!==1)throw new Error('Telegram binding denied');
  const member=await db.organizationMembership.findFirst({where:{id:scope.membershipId,organizationId:scope.organizationId,
    role:'OWNER',status:'ACTIVE',user:{status:'ACTIVE'},organization:{status:'ACTIVE'}},select:permissionMemberSelect});
  const permissions:PermissionKey[]=handoff?['CATALOG_VIEW','LEAD_VIEW','LEAD_CREATE']:['CATALOG_VIEW'];
  if(!member||permissions.some(key=>!memberHasPermission(member,key)))throw new Error('Telegram membership denied');
  const branch=await db.branch.findFirst({where:{id:scope.branchId,organizationId:scope.organizationId,status:'ACTIVE',isPublic:true},select:{id:true}});
  if(!branch)throw new Error('Telegram branch denied');
}
