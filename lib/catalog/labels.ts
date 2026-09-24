export type CatalogSizeLabelInput = {
  name?: string | null;
  code: string;
  sizeSystem?: string | null;
  recommendedHeightCm?: number | null;
  lengthCm?: number | null;
};

export function catalogSizeLabel(input: CatalogSizeLabelInput) {
  if (input.sizeSystem === "ONE_SIZE") return { primary: "Без размера", secondary: null };
  const primary = input.sizeSystem === "VOLUME_ML" && !/мл/i.test(input.code)
    ? `${input.code} мл`
    : input.code || input.name || "Без размера";
  const secondary = input.recommendedHeightCm
    ? `рост ${input.recommendedHeightCm} см`
    : input.lengthCm
      ? `${input.lengthCm} см`
      : null;
  return { primary, secondary };
}

export function catalogVariantLabel(input: {
  execution?: { name: string } | null;
  size: CatalogSizeLabelInput;
}) {
  const size = input.size.sizeSystem === "ONE_SIZE"
    ? "Без размера"
    : (input.size.name || input.size.code);
  return input.execution ? `${input.execution.name} · ${size}` : size;
}

export function catalogSelectionLabel(input: {
  product: { name: string };
  execution?: { name: string } | null;
  size: CatalogSizeLabelInput;
}) {
  return `${input.product.name} · ${catalogVariantLabel(input)}`;
}
