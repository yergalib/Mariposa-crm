import 'server-only';
import {createInquiryRecord} from '@/lib/inquiries/record';
import type {Prisma} from '@/generated/prisma/client';
import type {TelegramScope} from './adapter';

type ValidatedInquiry=Omit<Prisma.InquiryUncheckedCreateInput,'organizationId'|'branchId'|'source'>;
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
export async function telegramHandoff(scope:TelegramScope,request:{updateKey:string;draftHash:string;confirmed:boolean;draft:unknown},ports:TelegramHandoffPorts){
  if(!request.confirmed||!/^\d{1,16}$/.test(request.updateKey)||!/^[a-f0-9]{64}$/.test(request.draftHash))throw new Error('Telegram handoff confirmation required');
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
