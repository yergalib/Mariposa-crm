// LOCAL CANDIDATE ONLY: no route imports this module until persistence is approved.
// Repository operations MUST be atomic, scoped to the authenticated principal,
// and guarded by the existing owner window/permissions on every request.
export type ContinuationState = 'planning' | 'review_ready' | 'review_running' | 'complete' | 'blocked';
export type ContinuationRow<T> = {
  id: string; requestHash: string; state: ContinuationState; expiresAt: number;
  candidate: T | null; result: T | null;
};
export interface ContinuationRepository<T> {
  // Insert-if-absent by principal + idempotency key. Changed input must conflict.
  begin(key: string, requestHash: string): Promise<{created: boolean; row: ContinuationRow<T>}>;
  read(id: string): Promise<ContinuationRow<T> | null>;
  // Compare-and-set, never reset a running/blocked row to a ready state.
  stage(id: string, requestHash: string, candidate: T): Promise<boolean>;
  claimReview(id: string): Promise<ContinuationRow<T> | null>;
  complete(id: string, result: T): Promise<void>;
  block(id: string): Promise<void>;
}
export type ContinuationView<T> = {status:'pending';id:string} | {status:'complete';id:string;result:T} | {status:'blocked'|'expired';id:string};
export function continuationView<T>(row:ContinuationRow<T>,now=Date.now()):ContinuationView<T>{
  if(now>=row.expiresAt)return {status:'expired',id:row.id};
  if(row.state==='complete'&&row.result!==null)return {status:'complete',id:row.id,result:row.result};
  if(row.state==='blocked')return {status:'blocked',id:row.id};
  // Never return unreviewed candidate, including on timeout or parallel polling.
  return {status:'pending',id:row.id};
}
export async function prepareContinuation<T>(repo:ContinuationRepository<T>,key:string,hash:string,plan:()=>Promise<T>,now=Date.now):Promise<ContinuationView<T>>{
  const {created,row}=await repo.begin(key,hash);
  if(row.requestHash!==hash)throw new Error('Continuation input conflict');
  if(!created)return continuationView(row,now());
  try{
    const candidate=await plan(); // existing planner + real tools; no final review here
    if(!await repo.stage(row.id,hash,candidate))throw new Error('Checkpoint not committed');
    return {status:'pending',id:row.id};
  }catch(error){await repo.block(row.id);throw error;}
}
export async function finishContinuation<T>(repo:ContinuationRepository<T>,id:string,review: (candidate:T)=>Promise<T>,now=Date.now):Promise<ContinuationView<T>>{
  const existing=await repo.read(id);if(!existing)throw new Error('Continuation unavailable');
  const view=continuationView(existing,now());
  if(view.status!=='pending'||existing.state!=='review_ready')return view;
  const claimed=await repo.claimReview(id);
  if(!claimed)return {status:'pending',id};
  if(claimed.candidate===null)throw new Error('Checkpoint missing');
  try{
    // Existing provider ledger and semantic/grounded validation are mandatory.
    // Exactly one caller may execute this callback. No automatic replay on error.
    const result=await review(claimed.candidate);
    await repo.complete(id,result);
    const stored=await repo.read(id);if(!stored)throw new Error('Result receipt unavailable');
    return continuationView(stored,now());
  }catch(error){await repo.block(id);throw error;}
}
