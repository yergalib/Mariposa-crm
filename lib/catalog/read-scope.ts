// null is explicit organization-wide access; missing scope must never mean all branches.
export function catalogBranchFilter(allowedBranchIds: readonly string[] | null) {
  return allowedBranchIds === null ? undefined : { in: [...(allowedBranchIds ?? [])] };
}
export function catalogPriceBranch(defaultBranchId: string | null, allowedBranchIds: readonly string[] | null) {
  return defaultBranchId && (allowedBranchIds === null || allowedBranchIds?.includes(defaultBranchId)) ? defaultBranchId : null;
}
