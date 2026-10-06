import { z } from "zod";
export const FAVORITES_LIMIT = 12;
export const FAVORITES_KEY = "mariposa:favorites:v1";
export const favoriteRef = z.object({ productId: z.string().uuid(), executionId: z.string().uuid().nullable() }).strict();
export type FavoriteRef = z.infer<typeof favoriteRef>;
export const favoriteKey = (item: FavoriteRef) => `${item.productId}.${item.executionId ?? "default"}`;
export function parseFavoriteQuery(value: unknown): FavoriteRef[] {
  if (typeof value !== "string" || value.length > 1000) return [];
  const parts = value ? value.split(",") : [];
  if (parts.length > FAVORITES_LIMIT) return [];
  const result: FavoriteRef[] = [];
  for (const part of parts) {
    const fields = part.split("."); if (fields.length !== 2) return [];
    const parsed = favoriteRef.safeParse({ productId: fields[0], executionId: fields[1] === "default" ? null : fields[1] });
    if (!parsed.success) return [];
    if (!result.some(ref => favoriteKey(ref) === part)) result.push(parsed.data);
  }
  return result;
}
export function readFavorites(raw: string, now = Date.now()): FavoriteRef[] {
  try {
    if (raw.length > 2500) return [];
    const parsed = z.object({ version: z.literal(1), expiresAt: z.number().finite(), items: z.array(favoriteRef).max(FAVORITES_LIMIT) }).strict().parse(JSON.parse(raw));
    if (parsed.expiresAt <= now || parsed.expiresAt > now + 31 * 86400000) return [];
    return parseFavoriteQuery(parsed.items.map(favoriteKey).join(","));
  } catch { return []; }
}
export function encodeFavorites(items: FavoriteRef[], now = Date.now()) {
  return JSON.stringify({ version: 1, expiresAt: now + 30 * 86400000, items: parseFavoriteQuery(items.map(favoriteKey).join(",")) });
}
