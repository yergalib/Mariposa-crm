import"server-only";import type{AppRole}from"@/lib/auth/access";import{StaffError}from"@/lib/staff/errors";
export type StaffAction="READ"|"INVITE"|"MANAGE";
export function requireStaffPermission(actor:AppRole,action:StaffAction,target?:AppRole){if(actor==="OWNER")return;if(actor==="DIRECTOR"&&(action==="READ"||((action==="INVITE"||action==="MANAGE")&&(target==="SELLER"||target==="CASHIER"))))return;throw new StaffError("FORBIDDEN","Недостаточно прав для управления сотрудниками.")}
