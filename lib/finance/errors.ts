export class FinanceError extends Error {
  constructor(public readonly code:"INVALID"|"NOT_FOUND"|"CONFLICT"|"FORBIDDEN",message:string){super(message);this.name="FinanceError";}
}
