export function normalizeScannableCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function buildVariantSku(productCode: string, sizeCode: string) {
  const product = normalizeScannableCode(productCode);
  const size = normalizeScannableCode(sizeCode);
  if (!product || !size) throw new Error("Product and size codes are required.");
  return `${product}.${size}`;
}
