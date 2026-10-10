/** Allocate the original order discount in stable line order, then cumulative
 * unit fractions. Integer remainder is retained: a full return equals total. */
export function saleReturnValue(items: Array<{id:string; quantity:number; lineTotalMinor:bigint}>, total:bigint, itemId:string, before:number, quantity:number) {
  const sorted=[...items].sort((a,b)=>a.id.localeCompare(b.id));
  const sum=sorted.reduce((n,row)=>n+row.lineTotalMinor,BigInt(0));
  const item=sorted.find(row=>row.id===itemId);
  if(!item || !Number.isSafeInteger(before) || !Number.isSafeInteger(quantity) || quantity<1 || before<0 || before+quantity>item.quantity || total<0 || total>sum) throw Error("Некорректное количество или стоимость возврата.");
  if(sum===BigInt(0)) return BigInt(0);
  let prefix=BigInt(0);
  for(const row of sorted){if(row.id===itemId)break;prefix+=row.lineTotalMinor;}
  const budget=(prefix+item.lineTotalMinor)*total/sum-prefix*total/sum;
  return budget*BigInt(before+quantity)/BigInt(item.quantity)-budget*BigInt(before)/BigInt(item.quantity);
}
