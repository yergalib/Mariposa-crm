export function catalogVariantLabel(input: {
  execution?: { name: string } | null;
  size: { name: string; code: string; sizeSystem?: string | null };
}) {
  const size = input.size.sizeSystem === "ONE_SIZE"
    ? "Без размера"
    : (input.size.name || input.size.code);
  return input.execution ? `${input.execution.name} · ${size}` : size;
}

export function catalogSelectionLabel(input: {
  product: { name: string };
  execution?: { name: string } | null;
  size: { name: string; code: string; sizeSystem?: string | null };
}) {
  return `${input.product.name} · ${catalogVariantLabel(input)}`;
}
