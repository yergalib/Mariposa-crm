import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';

// Transport-neutral: a model may propose a draft, but cannot confirm it. The
// transport supplies a direct client confirmation of the persisted revision.
export const channelRequest = z.object({
  contact:z.string().trim().min(3).max(160),
  purpose:z.enum(['selection','exception']).default('selection'),
  variantIds:z.array(z.string().uuid()).max(3),
  from:z.string().min(1).max(40).nullable(),until:z.string().min(1).max(40).nullable(),
}).strict().refine(v=>new Set(v.variantIds).size===v.variantIds.length)
  .refine(v=>v.purpose==='exception'?v.variantIds.length===0&&v.from===null&&v.until===null:v.variantIds.length>0&&Boolean(v.from)&&Boolean(v.until));
export type ChannelRequest=z.infer<typeof channelRequest>;
export type RequestQuote={summary:string[];fingerprint:string};
export type ConfirmedDraft={id:string;draft:ChannelRequest;quote:RequestQuote;expiresAt:number;inquiryId:string|null};
export interface ChannelRequestTransaction {
  authorize():Promise<void>;
  read(id:string):Promise<ConfirmedDraft|null>;
  validate(draft:ChannelRequest):Promise<RequestQuote>;
  stage(draft:ChannelRequest,quote:RequestQuote):Promise<ConfirmedDraft>;
  create(draft:ConfirmedDraft):Promise<string>;
  receipt(id:string,inquiryId:string):Promise<void>;
  invalidate(id:string):Promise<void>;
}
export interface ChannelRequestStore {
  // Locks the authenticated principal; create + receipt commit together. A
  // failed transaction must leave neither an Inquiry nor a confirmation receipt.
  transaction<T>(operation:(tx:ChannelRequestTransaction)=>Promise<T>):Promise<T>;
}
export const quoteFingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function prepareChannelRequest(raw:unknown,store:ChannelRequestStore){
  const draft=channelRequest.parse(raw);
  return store.transaction(async tx=>{await tx.authorize();const quote=await tx.validate(draft);return tx.stage(draft,quote);});
}
export function confirmChannelRequest(id:string,explicit:boolean,store:ChannelRequestStore,now=Date.now()){
  if(!explicit||!z.string().uuid().safeParse(id).success)throw Error('REQUEST_CONFIRMATION_REQUIRED');
  return store.transaction(async tx=>{
    await tx.authorize();const saved=await tx.read(id);
    if(!saved)throw Error('REQUEST_NOT_FOUND');
    // An acknowledged commit remains readable after expiry. Never create twice.
    if(saved.inquiryId)return {status:'created' as const,inquiryId:saved.inquiryId};
    if(saved.expiresAt<=now)throw Error('REQUEST_EXPIRED');
    const fresh=await tx.validate(saved.draft);
    if(fresh.fingerprint!==saved.quote.fingerprint){await tx.invalidate(saved.id);return {status:'changed' as const,summary:fresh.summary};}
    const inquiryId=await tx.create(saved);
    if(!inquiryId)throw Error('REQUEST_UNCONFIRMED');
    await tx.receipt(saved.id,inquiryId);
    return {status:'created' as const,inquiryId};
  });
}
