// Collapse presentation only; every catalogue size remains available on demand.
export function SizeSummary({ sizes }: { sizes: string[] }) {
  const unique = [...new Set(sizes)];
  if (unique.length <= 4) return <p className="size-summary">Размеры: {unique.join(", ") || "Уточните у сотрудника"}</p>;
  return <details className="size-summary"><summary>Размеры: {unique.slice(0, 4).join(", ")} <span>и ещё {unique.length - 4}</span></summary><p>{unique.join(", ")}</p></details>;
}
