// Historical CRM field name amountMinor stores whole currency units here.
// Do not divide by 100 or infer a rental duration from this catalogue amount.
export function formatCatalogMoney(amount: string, currency: string) {
  if (!/^\d+$/.test(amount)) throw new Error('Invalid catalogue amount');
  return BigInt(amount).toLocaleString('ru-RU')+' '+(currency==='KZT'?'₸':currency);
}
