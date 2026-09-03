export class StaffError extends Error{constructor(public code:"NOT_FOUND"|"FORBIDDEN"|"INVALID"|"CONFLICT"|"EXPIRED",message:string){super(message);this.name="StaffError"}}
