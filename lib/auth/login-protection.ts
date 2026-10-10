import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/audit/log";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
export const LOGIN_FAILURE = "Не удалось войти. Проверьте данные или повторите попытку позже.";
const IDENTITY_LIMIT=10, GLOBAL_LIMIT=200;
async function consume(tx:Prisma.TransactionClient,key:string,seconds:number){
 const rows=await tx.$queryRaw<Array<{attempts:number}>>`INSERT INTO login_attempt_buckets(key,attempts,window_ends_at) VALUES(${key},1,clock_timestamp()+make_interval(secs=>${seconds})) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempt_buckets.window_ends_at<=clock_timestamp() THEN 1 ELSE LEAST(login_attempt_buckets.attempts+1,1000000) END, window_ends_at=CASE WHEN login_attempt_buckets.window_ends_at<=clock_timestamp() THEN clock_timestamp()+make_interval(secs=>${seconds}) ELSE login_attempt_buckets.window_ends_at END RETURNING attempts`;
 return rows[0].attempts;
}
/** DB atomic counters are shared by all workers and sources; never trust forwarded IP. */
export async function reserveLoginAttempt(email:string){
 const key="identity:"+createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
 return db.$transaction(async tx=>{
  await tx.$executeRaw`DELETE FROM login_attempt_buckets WHERE window_ends_at < clock_timestamp() - interval '1 day'`;
  if(await consume(tx,"global",60)>GLOBAL_LIMIT)return false;
  return await consume(tx,key,15*60)<=IDENTITY_LIMIT;
 });
}
export async function authenticateLogin(rawEmail:unknown,rawPassword:unknown){
 const email=typeof rawEmail==="string"?rawEmail.trim().toLowerCase():"";
 const validInput=email.length>=3&&email.length<=254&&email.includes("@")&&typeof rawPassword==="string"&&rawPassword.length>=1&&rawPassword.length<=1024;
 const allowed=await reserveLoginAttempt(email.length<=254?email:"invalid");
 if(!allowed){await appendAuditLog(db,{organizationId:null,action:"AUTH_LOGIN_THROTTLED",entityType:"Authentication",source:"SYSTEM",result:"DENIED"});return null;}
 const user=validInput?await db.user.findUnique({where:{email},include:{memberships:{where:{status:"ACTIVE",organization:{status:"ACTIVE"}},orderBy:[{createdAt:"asc"},{id:"asc"}],take:1}}}):null;
 const membership=user?.memberships[0];
 const validPassword=validInput?await verifyPassword(user?.passwordHash??DUMMY_PASSWORD_HASH,rawPassword as string):false;
 const accepted=Boolean(user&&user.status==="ACTIVE"&&membership&&validPassword);
 await appendAuditLog(db,{organizationId:membership?.organizationId??null,actorUserId:membership?user!.id:null,actorMembershipId:membership?.id??null,action:accepted?"AUTH_LOGIN_SUCCEEDED":"AUTH_LOGIN_DENIED",entityType:"Authentication",source:"SYSTEM",result:accepted?"SUCCESS":"DENIED"});
 return accepted?{userId:user!.id,membershipId:membership!.id,organizationId:membership!.organizationId}:null;
}
