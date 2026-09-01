export class CustomerError extends Error {
  constructor(public readonly code: "NOT_FOUND"|"FORBIDDEN"|"VALIDATION"|"POSSIBLE_DUPLICATE"|"IMPORT_INVALID", message:string, public readonly duplicates:Array<{id:string;customerNumber:string;name:string}>=[]) { super(message); this.name="CustomerError"; }
}
