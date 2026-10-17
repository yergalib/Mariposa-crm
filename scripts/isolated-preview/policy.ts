// Preparation-only executable policy. No runtime imports, env reads or DB access.
// Evidence must come from independently verified resource/config metadata, not
// from request parameters or self-asserted environment flags.
export const PROJECT = 'prj_FSsQxUktUBH9VNCGeadBoNnzlD1W';
export const REF = 'review/ai-header-preview-candidate-20261011';
export const KNOWN_LIVE_RESOURCE = 'jawposhuxaexoqzopgoq';
export type Evidence = {
  approved: boolean; syntheticOnly: boolean; resourceRef: string;
  organizationId: string; ownerMembershipId: string;
  databaseHost: string; databaseName: string;
  databaseVariableBranch: string; storageDisabled: boolean;
  verifiedAt: string; expiresAt: string;
};
export type Scope = {
  environment: string; projectId: string; branch: string;
  organizationId: string; databaseHost: string; databaseName: string;
  assistantEnabled: string;
};
export function previewGates(scope: Scope, evidence: Evidence | null, now: number) {
  const closed = { history: false, handoff: false, publicIntake: false, llm: false } as const;
  if (!evidence || !evidence.approved || !evidence.syntheticOnly || !evidence.storageDisabled) return closed;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(evidence.organizationId) || !uuid.test(evidence.ownerMembershipId)) return closed;
  const start = Date.parse(evidence.verifiedAt), end = Date.parse(evidence.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000 || now < start || now >= end) return closed;
  if (scope.environment !== 'preview' || scope.projectId !== PROJECT || scope.branch !== REF
    || scope.organizationId !== evidence.organizationId || scope.assistantEnabled !== '0'
    || evidence.databaseVariableBranch !== REF) return closed;
  // Initial candidate accepts a dedicated direct Supabase endpoint only.
  // Poolers require a separately reviewed identity binding; name alone is insufficient.
  if (!/^[a-z]{20}$/.test(evidence.resourceRef) || evidence.resourceRef === KNOWN_LIVE_RESOURCE
    || evidence.databaseHost !== `db.${evidence.resourceRef}.supabase.co`
    || scope.databaseHost !== evidence.databaseHost || !evidence.databaseName
    || scope.databaseName !== evidence.databaseName) return closed;
  return { history: true, handoff: true, publicIntake: false, llm: false } as const;
}
