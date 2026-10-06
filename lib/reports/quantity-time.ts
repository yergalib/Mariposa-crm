export function rentalQuantityTime(input:{start:Date;end:Date;issuedAt:Date|null;issuedQuantity:number;returnedQuantity:number;returnedAt:Date|null;serialized:boolean;resolutions:{occurredAt:Date;totalQuantity:number;kind:string}[]}){
 if(!input.issuedAt||input.issuedQuantity<=0)return{unitMilliseconds:0,complete:input.issuedQuantity===0};
 const events=input.serialized?(input.returnedQuantity&&input.returnedAt?[{occurredAt:input.returnedAt,totalQuantity:input.returnedQuantity}]:[]):input.resolutions;
 const returned=input.serialized?input.returnedQuantity:input.resolutions.filter(r=>r.kind==="RETURN").reduce((s,r)=>s+r.totalQuantity,0);
 const lost=input.resolutions.filter(r=>r.kind==="LOSS_RESOLUTION").reduce((s,r)=>s+r.totalQuantity,0);
 if(returned!==input.returnedQuantity||returned+lost>input.issuedQuantity||input.returnedQuantity>0&&input.serialized&&!input.returnedAt)return{unitMilliseconds:0,complete:false};
 let outstanding=input.issuedQuantity,last=input.issuedAt.getTime(),total=0;
 for(const event of [...events].sort((a,b)=>a.occurredAt.getTime()-b.occurredAt.getTime())){const at=event.occurredAt.getTime();if(at<last||event.totalQuantity<=0||event.totalQuantity>outstanding)return{unitMilliseconds:0,complete:false};total+=Math.max(0,Math.min(at,input.end.getTime())-Math.max(last,input.start.getTime()))*outstanding;outstanding-=event.totalQuantity;last=at;}
 total+=Math.max(0,input.end.getTime()-Math.max(last,input.start.getTime()))*outstanding;
 return{unitMilliseconds:total,complete:true};
}
