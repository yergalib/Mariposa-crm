import { performance } from "node:perf_hooks";
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ownerMainRestricted } from '@/lib/assistant/owner-day-config';
type Stage = 'session' | 'permission' | 'setup' | 'catalog' | 'cards' | 'availability' | 'photo_auth' | 'photo_metadata' | 'storage';
type Sample = { ms: number; count: number };
const scope = new AsyncLocalStorage<{ allowed: boolean; samples: Map<Stage, Sample>; reads: Map<string, Promise<unknown>>; photo?: string }>();
// Mirrors request-local RSC memoization for these two read-only route handlers.
// No store exists for inquiry, handoff, transactions, other routes or later requests.
export function oncePerReadRequest<T>(key: 'session' | 'catalog_permission', work:()=>Promise<T>):Promise<T> {
 const s=scope.getStore(); if(!s)return work(); let result=s.reads.get(key);
 if(!result){result=Promise.resolve().then(work);s.reads.set(key,result)} return result as Promise<T>;
}
export function allowRequestTiming() { const s=scope.getStore(); if(s) s.allowed=true; }
export async function timed<T>(stage: Stage, work:()=>Promise<T>):Promise<T> {
 const s=scope.getStore(); if(!s)return work(); const start=performance.now();
 try{return await work()}finally{const old=s.samples.get(stage)??{ms:0,count:0};old.ms+=performance.now()-start;old.count++;s.samples.set(stage,old)}
}
export function photoOutcome(outcome:'ok'|'missing'|'storage_error'|'storage_empty'|'oversize'|'invalid_format') { const s=scope.getStore();if(s)s.photo=outcome; }
// Request-local only: no identifiers, user text, URLs, error messages or credentials.
// Only the already-authorized owner-day response receives diagnostics; no logs written.
export async function withRequestTiming(work:()=>Promise<Response>):Promise<Response>{
 if(!ownerMainRestricted())return work();
 return scope.run({allowed:false,samples:new Map(),reads:new Map()},async()=>{const start=performance.now();const response=await work();const s=scope.getStore()!;
 if(s.allowed){response.headers.set('Server-Timing',[...s.samples].map(([name,v])=>name+';dur='+v.ms.toFixed(1)+';desc="'+v.count+'"').concat('total;dur='+(performance.now()-start).toFixed(1)).join(', '));if(s.photo)response.headers.set('X-Mariposa-Photo-Outcome',s.photo)}
 return response;});
}
