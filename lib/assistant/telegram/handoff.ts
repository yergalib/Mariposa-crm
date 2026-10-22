import 'server-only';
import {createHash} from 'node:crypto';
import {createInquiryRecord} from '@/lib/inquiries/record';
import type {Prisma} from '@/generated/prisma/client';
import type {TelegramScope} from './adapter';

type ValidatedInquiry=Omit<Prisma.InquiryUncheckedCreateInput,'organizationId'|'branchId'|'source'>;
export function telegramDraftHash(scope:TelegramScope,key:string,draft:unknown){
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
  const encoded=JSON.stringify([scope.organizationId,scope.principal,key,canonical(draft)]);
  if(encoded.length>12000)throw new Error('Telegram draft too large');
  return createHash('sha256').update(encoded).digest('hex');
}
export interface TelegramHandoffPorts {
  authorize(scope:TelegramScope):Promise<void>;
  // Transaction locks binding + completed turn, compares the persisted confirmed
  // draft hash, returns receipt if present, or invokes create and stores its ID in
  // THE SAME transaction. Replays may never invoke create twice.
  once(scope:TelegramScope,updateKey:string,draftHash:string,create:(tx:Prisma.TransactionClient)=>Promise<string>):Promise<string>;
  // Existing public product/variant/operation/branch/current-price validation;
  // contact consent required. Never trust payload prices or product IDs.
  validate(tx:Prisma.TransactionClient,scope:TelegramScope,draft:unknown):Promise<{data:ValidatedInquiry;itemCount:number}>;
}
export interface TelegramConfirmationPorts extends TelegramHandoffPorts {
  stage(scope:TelegramScope,key:string,hash:string,validate:(tx:Prisma.TransactionClient)=>Promise<number>):Promise<number>;
}
export async function prepareTelegramHandoff(scope:TelegramScope,key:string,draft:unknown,ports:TelegramConfirmationPorts){
  if(!/^\d{1,16}$/.test(key))throw new Error('Telegram update required');
  await ports.authorize(scope);
  const draftHash=telegramDraftHash(scope,key,draft);
  const itemCount=await ports.stage(scope,key,draftHash,async tx=>{
    await ports.authorize(scope);
    return (await ports.validate(tx,scope,draft)).itemCount;
  });
  return {status:'awaiting_confirmation' as const,draftHash,itemCount};
}
export async function telegramHandoff(scope:TelegramScope,request:{updateKey:string;draftHash:string;confirmed:boolean;draft:unknown},ports:TelegramHandoffPorts){
  if(!request.confirmed||!/^\d{1,16}$/.test(request.updateKey)||!/^[a-f0-9]{64}$/.test(request.draftHash))throw new Error('Telegram handoff confirmation required');
  if(telegramDraftHash(scope,request.updateKey,request.draft)!==request.draftHash)throw new Error('Telegram draft changed');
  await ports.authorize(scope);
  const id=await ports.once(scope,request.updateKey,request.draftHash,async tx=>{
    await ports.authorize(scope);
    const validated=await ports.validate(tx,scope,request.draft);
    const receipt=await createInquiryRecord(tx,{...validated.data,organizationId:scope.organizationId,branchId:scope.branchId,source:'TELEGRAM'},
      {actorMembershipId:scope.membershipId,itemCount:validated.itemCount});
    return receipt.id;
  });
  if(!id)throw new Error('Telegram inquiry unconfirmed');
  return {status:'created' as const,inquiryId:id};
}
