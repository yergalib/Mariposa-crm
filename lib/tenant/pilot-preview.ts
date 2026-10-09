// This rollout branch is deliberately PILOT-only. Never promote it to Production.
export const PILOT_ORGANIZATION_ID = "de1e9e01-c7ad-45fc-899a-d2287f771355";
export function assertPilotOrganization(id: string) {
  if (process.env.VERCEL_ENV === "production" || id !== PILOT_ORGANIZATION_ID) {
    throw new Error("This preview is restricted to MARIPOSA PILOT.");
  }
}
