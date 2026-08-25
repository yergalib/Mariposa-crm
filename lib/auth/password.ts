import "server-only";

import { hash, verify } from "@node-rs/argon2";

const ARGON_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const;

// Keeps an unknown email on the same expensive verification path as a known one.
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Timb/10IfxCRBV/owwvvcQ$Ok+GFfhKa7olKf0pmXi2SU1byrvK2Zc+GzmdCxEiges";

export function hashPassword(password: string) {
  return hash(password, ARGON_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}
