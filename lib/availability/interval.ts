import { InvalidPeriodError } from "@/lib/availability/errors";

export type EffectiveInterval = {
  effectiveBlockedFrom: Date;
  effectiveBlockedUntil: Date | null;
  turnaroundBufferMinutes: number;
};

export function calculateEffectiveInterval(input: {
  requestedFrom: Date;
  requestedUntil: Date | null;
  turnaroundBufferMinutes: number;
  allowOpenEnded: boolean;
}): EffectiveInterval {
  if (!Number.isFinite(input.requestedFrom.getTime())) {
    throw new InvalidPeriodError();
  }
  if (!Number.isInteger(input.turnaroundBufferMinutes) || input.turnaroundBufferMinutes < 0) {
    throw new InvalidPeriodError("Turnaround buffer must be a non-negative integer.");
  }
  if (!input.requestedUntil) {
    if (!input.allowOpenEnded) {
      throw new InvalidPeriodError("An end time is required for this allocation source.");
    }
    return {
      effectiveBlockedFrom: input.requestedFrom,
      effectiveBlockedUntil: null,
      turnaroundBufferMinutes: input.turnaroundBufferMinutes
    };
  }
  if (!Number.isFinite(input.requestedUntil.getTime()) || input.requestedUntil <= input.requestedFrom) {
    throw new InvalidPeriodError();
  }

  return {
    effectiveBlockedFrom: input.requestedFrom,
    effectiveBlockedUntil: new Date(
      input.requestedUntil.getTime() + input.turnaroundBufferMinutes * 60_000
    ),
    turnaroundBufferMinutes: input.turnaroundBufferMinutes
  };
}
