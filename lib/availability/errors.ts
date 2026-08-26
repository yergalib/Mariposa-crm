export type AvailabilityErrorCode =
  | "INSUFFICIENT_CAPACITY"
  | "INVALID_PERIOD"
  | "INVALID_QUANTITY"
  | "RESOURCE_NOT_FOUND"
  | "ALLOCATION_NOT_FOUND"
  | "INVALID_ALLOCATION_STATE"
  | "INSTANCE_UNAVAILABLE";

export class AvailabilityError extends Error {
  constructor(readonly code: AvailabilityErrorCode, message: string) {
    super(message);
    this.name = "AvailabilityError";
  }
}

export class InsufficientCapacityError extends AvailabilityError {
  constructor(readonly available: number, readonly requested: number) {
    super("INSUFFICIENT_CAPACITY", `Requested quantity exceeds available capacity.`);
    this.name = "InsufficientCapacityError";
  }
}

export class InvalidPeriodError extends AvailabilityError {
  constructor(message = "The requested period is invalid.") {
    super("INVALID_PERIOD", message);
    this.name = "InvalidPeriodError";
  }
}

export class InvalidQuantityError extends AvailabilityError {
  constructor() {
    super("INVALID_QUANTITY", "Quantity must be a positive integer.");
    this.name = "InvalidQuantityError";
  }
}

export class ResourceNotFoundError extends AvailabilityError {
  constructor() {
    super("RESOURCE_NOT_FOUND", "The requested resource was not found.");
    this.name = "ResourceNotFoundError";
  }
}

export class AllocationNotFoundError extends AvailabilityError {
  constructor() {
    super("ALLOCATION_NOT_FOUND", "The allocation was not found.");
    this.name = "AllocationNotFoundError";
  }
}

export class InvalidAllocationStateError extends AvailabilityError {
  constructor() {
    super("INVALID_ALLOCATION_STATE", "The allocation is not active.");
    this.name = "InvalidAllocationStateError";
  }
}

export class InstanceUnavailableError extends AvailabilityError {
  constructor() {
    super("INSTANCE_UNAVAILABLE", "The instance is unavailable for the requested period.");
    this.name = "InstanceUnavailableError";
  }
}

export function isDatabaseExclusionViolation(error: unknown): boolean {
  const queue: unknown[] = [error];
  const visited = new Set<object>();
  for (let inspected = 0; queue.length > 0 && inspected < 24; inspected += 1) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const candidate = current as Record<string, unknown>;
    if (candidate.code === "23P01" || candidate.sqlState === "23P01") return true;
    for (const key of ["cause", "meta", "driverAdapterError", "originalError", "error"]) {
      if (candidate[key]) queue.push(candidate[key]);
    }
  }
  return false;
}
