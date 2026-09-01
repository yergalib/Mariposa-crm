export type OrderErrorCode="NOT_FOUND"|"FORBIDDEN"|"VALIDATION"|"INVALID_STATE"|"PRICE_NOT_FOUND"|"CAPACITY";
export class OrderError extends Error{constructor(public code:OrderErrorCode,message:string){super(message);this.name="OrderError";}}
