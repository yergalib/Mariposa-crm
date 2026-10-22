// LOCAL CANDIDATE ONLY: deliberately not imported by routes or live owner runtime.
// Repository must hold a tenant budget lock then a principal lock in one transaction.
import {createHash} from 'node:crypto';
export const customerLimits=Object.freeze({turnsPerMinute:3,turnsPerDay:10,providerCallsPerDay:100,budgetNano:BigInt(10000000000)});
export type CustomerScope=Readonly<{tenant:string;bot:number;user:number;chat:number;branch:string;generation:string;consentVersion:string}>;
export function customerPrincipal(server: {tenant:string;bot:number;branches:readonly string[];generation:string;consentVersion:string}, event:{bot:number;user:number;chat:number;private:boolean;isBot:boolean},consent:{version:string;accepted:boolean},branch:string):CustomerScope{
 if(!server.tenant||!server.generation||!server.consentVersion||!server.branches.includes(branch)||event.bot!==server.bot||!Number.isSafeInteger(event.user)||event.user<=0||event.chat!==event.user||!event.private||event.isBot||!consent.accepted||consent.version!==server.consentVersion)throw Error('CUSTOMER_DENIED');
 return Object.freeze({tenant:server.tenant,bot:server.bot,user:event.user,chat:event.chat,branch,generation:server.generation,consentVersion:consent.version});
}
export function customerKey(s:CustomerScope){return createHash('sha256').update(JSON.stringify([s.tenant,s.bot,s.user,s.chat,s.generation])).digest('hex');}
export function customerDay(now:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export type AdmissionSnapshot={existingHash:string|null;minuteTurns:number;dayTurns:number;activeTurn:boolean;globalCalls:number;globalDebitNano:bigint;unresolvedProvider:boolean};
export function customerAdmission(snapshot:AdmissionSnapshot,hash:string,fullTurnReserve:bigint,maximumCalls:number){
 if(!/^[a-f0-9]{64}$/.test(hash)||fullTurnReserve<=BigInt(0)||!Number.isInteger(maximumCalls)||maximumCalls<1||maximumCalls>4)throw Error('INVALID_ADMISSION');
 if(snapshot.existingHash!==null){if(snapshot.existingHash!==hash)throw Error('UPDATE_CONFLICT');return 'existing' as const;}
 if(snapshot.activeTurn||snapshot.unresolvedProvider)throw Error('PENDING_OUTCOME');
 if(snapshot.minuteTurns>=customerLimits.turnsPerMinute||snapshot.dayTurns>=customerLimits.turnsPerDay)throw Error('USER_RATE_LIMIT');
 if(snapshot.globalCalls+maximumCalls>customerLimits.providerCallsPerDay||snapshot.globalDebitNano+fullTurnReserve>customerLimits.budgetNano)throw Error('GLOBAL_LIMIT');
 return 'accept' as const;
}
// No memory quota store here: accepting must atomically persist update hash + quota
// under both locks. Existing duplicates return their state, never plan or debit again.
// Debit is the common settled receipt projection including full pending/unknown reserves.
