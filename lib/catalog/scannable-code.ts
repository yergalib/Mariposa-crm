export function normalizeScannableCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function buildVariantSku(productCode: string, sizeCode: string) {
  const product = normalizeScannableCode(productCode);
  const size = normalizeScannableCode(sizeCode);
  if (!product || !size) throw new Error("Product and size codes are required.");
  return `${product}.${size}`;
}

export function buildExecutionVariantSku(productCode: string, executionCode: string, sizeCode: string) {
  const product = normalizeScannableCode(productCode);
  const execution = normalizeScannableCode(executionCode);
  const size = normalizeScannableCode(sizeCode);
  if (!product || !execution || !size) throw new Error("Product, execution and size codes are required.");
  return `${product}.${execution}.${size}`;
}
