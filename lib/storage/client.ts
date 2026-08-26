import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseStorageConfig } from "@/lib/env";

export const PRODUCT_IMAGES_BUCKET = "product-images";

export function getStorageClient() {
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  return createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
