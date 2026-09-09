import type { FinancialTransactionKind } from "@/generated/prisma/client";

export type FinancialEffects={obligationEffectMinor:bigint;cashEffectMinor:bigint;revenueEffectMinor:bigint;depositEffectMinor:bigint};
export function effectsFor(kind:Exclude<FinancialTransactionKind,"REVERSAL">,amount:bigint):FinancialEffects {
  const zero=BigInt(0);
  switch(kind){
    case"RENTAL_CHARGE":case"SALE_CHARGE":case"DAMAGE_CHARGE":return{obligationEffectMinor:amount,cashEffectMinor:zero,revenueEffectMinor:amount,depositEffectMinor:zero};
    case"DISCOUNT":return{obligationEffectMinor:-amount,cashEffectMinor:zero,revenueEffectMinor:-amount,depositEffectMinor:zero};
    case"PAYMENT_RECEIVED":return{obligationEffectMinor:-amount,cashEffectMinor:amount,revenueEffectMinor:zero,depositEffectMinor:zero};
    case"CUSTOMER_REFUND":return{obligationEffectMinor:amount,cashEffectMinor:-amount,revenueEffectMinor:zero,depositEffectMinor:zero};
    case"DEPOSIT_RECEIVED":return{obligationEffectMinor:zero,cashEffectMinor:amount,revenueEffectMinor:zero,depositEffectMinor:amount};
    case"DEPOSIT_REFUNDED":return{obligationEffectMinor:zero,cashEffectMinor:-amount,revenueEffectMinor:zero,depositEffectMinor:-amount};
    case"DEPOSIT_WITHHELD":return{obligationEffectMinor:-amount,cashEffectMinor:zero,revenueEffectMinor:zero,depositEffectMinor:-amount};
  }
}
