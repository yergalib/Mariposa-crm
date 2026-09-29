import { OrderError } from "@/lib/orders/errors";

export function parseTransactionSalePrice(value:unknown){
  const normalized=String(value??"").replace(/[\s_]/g,"");
  if(!/^\d+$/.test(normalized))throw new OrderError("VALIDATION","Укажите корректную цену продажи.");
  return BigInt(normalized);
}

export function calculateSaleLine(input:{unitPriceMinor:bigint;quantity:number;discountMinor:bigint}){
  if(!Number.isInteger(input.quantity)||input.quantity<=0||input.quantity>1000)throw new OrderError("VALIDATION","Некорректное количество товара.");
  if(input.unitPriceMinor<BigInt(0))throw new OrderError("VALIDATION","Цена продажи не может быть отрицательной.");
  if(input.discountMinor<BigInt(0))throw new OrderError("VALIDATION","Скидка не может быть отрицательной.");
  const grossMinor=input.unitPriceMinor*BigInt(input.quantity);
  if(input.discountMinor>grossMinor)throw new OrderError("VALIDATION","Скидка позиции превышает стоимость.");
  return{grossMinor,lineTotalMinor:grossMinor-input.discountMinor};
}
