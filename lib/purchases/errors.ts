export class PurchaseError extends Error {
  constructor(public code:"INVALID"|"NOT_FOUND"|"CONFLICT"|"INVALID_STATE",message:string){super(message);this.name="PurchaseError"}
}
