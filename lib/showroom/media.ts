import 'server-only';
import { createHash } from 'node:crypto';
export class PublicMediaError extends Error {constructor(public status:number,public retryAfter=60){super('Public media unavailable')}}
let windowStart=0,requests=0;const cache=new Map<string,{blob:Blob;expires:number}>(),pending=new Map<string,Promise<Blob>>();const etags=new WeakMap<Blob,string>();let bytes=0;
export function mediaPressureLimit(now=Date.now()){if(now-windowStart>=60000){windowStart=now;requests=0}if(++requests>600)throw new PublicMediaError(429,Math.max(1,Math.ceil((windowStart+60000-now)/1000)))}
// Call only AFTER checking current tenant/publication/image eligibility. Never
// cache authorization or private originals. Bounded bytes, entries and downloads.
export async function cachedPublicRendition(key:string,download:()=>Promise<Blob>){
  const now=Date.now();for(const[k,v]of cache)if(v.expires<=now){bytes-=v.blob.size;cache.delete(k)}
  const found=cache.get(key);if(found)return found.blob;
  const inflight=pending.get(key);if(inflight)return inflight;
  if(pending.size>=8)throw new PublicMediaError(429,2);
  const operation=download().then(async blob=>{while(cache.size>=64||bytes+blob.size>32*1024*1024){const oldest=cache.keys().next().value;if(!oldest)break;bytes-=cache.get(oldest)!.blob.size;cache.delete(oldest)}cache.set(key,{blob,expires:Date.now()+60000});bytes+=blob.size;etags.set(blob,'"'+createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex')+'"');return blob}).finally(()=>pending.delete(key));
  pending.set(key,operation);return operation;
}
export function publicPhotoETag(blob:Blob){return etags.get(blob)}
