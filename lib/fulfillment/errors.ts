export type FulfillmentErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_STATE"
  | "WRONG_PRODUCT"
  | "WRONG_SIZE"
  | "WRONG_BRANCH"
  | "INSTANCE_UNAVAILABLE"
  | "ASSIGNMENT_LIMIT";

export class FulfillmentError extends Error {
  constructor(public code: FulfillmentErrorCode, message: string) {
    super(message);
    this.name = "FulfillmentError";
  }
}
