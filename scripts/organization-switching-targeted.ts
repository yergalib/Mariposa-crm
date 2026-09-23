import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import { getAvailableOrganizations, rotateOrganizationSession } from "../lib/auth/organizations";
import { hashSessionToken } from "../lib/auth/session-token";
import { canAccessBranch } from "../lib/staff/branch-access";
import { hasPermission } from "../lib/permissions/effective";
import { getCatalogProducts } from "../lib/catalog/queries";

let passed = 0;
const organizationIds: string[] = [];
const userIds: string[] = [];
function pass(name: string, condition: unknown) { if (!condition) throw new Error(`FAIL ${name}`); passed++; }
async function rejects(work: () => Promise<unknown>) { try { await work(); return false; } catch { return true; } }

async function cleanup() {
  if (organizationIds.length) {
    await db.authSession.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.membershipBranchAccess.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.membershipPermissionOverride.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.product.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.location.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.branch.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds }, memberships: { none: {} } } });
}

async function main() {
  await cleanup();
  const suffix = randomUUID().slice(0, 8);
  const [organizationA, organizationB, organizationInactive, organizationOther] = Array.from({ length: 4 }, () => randomUUID());
  organizationIds.push(organizationA, organizationB, organizationInactive, organizationOther);
  const [userId, singleUserId, otherUserId] = Array.from({ length: 3 }, () => randomUUID());
  userIds.push(userId, singleUserId, otherUserId);

  await db.organization.createMany({ data: [
    { id: organizationA, name: `Switch A ${suffix}`, slug: `organization-switch-a-${suffix}` },
    { id: organizationB, name: `Switch B ${suffix}`, slug: `organization-switch-b-${suffix}` },
    { id: organizationInactive, name: `Switch inactive ${suffix}`, slug: `organization-switch-inactive-${suffix}` },
    { id: organizationOther, name: `Switch other ${suffix}`, slug: `organization-switch-other-${suffix}` }
  ] });
  await db.user.createMany({ data: [
    { id: userId, email: `organization-switch-main-${suffix}@test.invalid`, displayName: "Main", passwordHash: "test" },
    { id: singleUserId, email: `organization-switch-single-${suffix}@test.invalid`, displayName: "Single", passwordHash: "test" },
    { id: otherUserId, email: `organization-switch-other-${suffix}@test.invalid`, displayName: "Other", passwordHash: "test" }
  ] });

  const branchA = await db.branch.create({ data: { organizationId: organizationA, name: "A", code: `A-${suffix}`, city: "Astana", timezone: "Asia/Almaty" } });
  const branchB = await db.branch.create({ data: { organizationId: organizationB, name: "B allowed", code: `B1-${suffix}`, city: "Astana", timezone: "Asia/Almaty" } });
  const branchBBlocked = await db.branch.create({ data: { organizationId: organizationB, name: "B blocked", code: `B2-${suffix}`, city: "Astana", timezone: "Asia/Almaty" } });
  const membershipA = await db.organizationMembership.create({ data: { organizationId: organizationA, userId, role: "OWNER", status: "ACTIVE", defaultBranchId: branchA.id, joinedAt: new Date() } });
  const membershipB = await db.organizationMembership.create({ data: { organizationId: organizationB, userId, role: "SELLER", status: "ACTIVE", defaultBranchId: branchB.id, joinedAt: new Date(), branchAccess: { create: { organizationId: organizationB, branchId: branchB.id } }, permissionOverrides: { create: { organizationId: organizationB, permissionKey: "ORDER_CANCEL", effect: "ALLOW" } } } });
  const inactiveMembership = await db.organizationMembership.create({ data: { organizationId: organizationInactive, userId, role: "OWNER", status: "SUSPENDED", joinedAt: new Date() } });
  const singleMembership = await db.organizationMembership.create({ data: { organizationId: organizationA, userId: singleUserId, role: "SELLER", status: "ACTIVE", defaultBranchId: branchA.id, joinedAt: new Date(), branchAccess: { create: { organizationId: organizationA, branchId: branchA.id } } } });
  const otherMembership = await db.organizationMembership.create({ data: { organizationId: organizationOther, userId: otherUserId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() } });

  await db.product.createMany({ data: [
    { organizationId: organizationA, name: "Only A", internalCode: `ONLY-A-${suffix}`, trackingMode: "BULK", publicationStatus: "ACTIVE" },
    { organizationId: organizationB, name: "Only B", internalCode: `ONLY-B-${suffix}`, trackingMode: "BULK", publicationStatus: "ACTIVE" }
  ] });

  const single = await getAvailableOrganizations({ userId: singleUserId, membershipId: singleMembership.id });
  pass("one active membership", single.length === 1 && single[0]?.isCurrent);
  const available = await getAvailableOrganizations({ userId, membershipId: membershipA.id });
  pass("two active memberships", available.length === 2 && available.every((row) => row.membershipId !== inactiveMembership.id));

  const originalToken = `organization-switch-original-${suffix}`;
  const original = await db.authSession.create({ data: { organizationId: organizationA, userId, membershipId: membershipA.id, tokenHash: createHash("sha256").update(originalToken).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
  const switched = await rotateOrganizationSession({ currentSessionId: original.id, userId, targetMembershipId: membershipB.id });
  pass("switch A to B", switched.organizationId === organizationB);
  pass("new session membership", switched.membershipId === membershipB.id);
  pass("old session revoked", Boolean((await db.authSession.findUniqueOrThrow({ where: { id: original.id } })).revokedAt));
  pass("session token rotates", switched.token !== originalToken && hashSessionToken(switched.token) === (await db.authSession.findUniqueOrThrow({ where: { id: switched.id } })).tokenHash);

  const currentB = { organizationId: organizationB, membershipId: membershipB.id, role: "SELLER" as const };
  const productsB = await getCatalogProducts({ tenant: createTenantContext(organizationB), defaultBranchId: branchB.id });
  pass("cross tenant catalog isolated", productsB.length === 1 && productsB[0]?.name === "Only B");
  pass("target branch access applied", await canAccessBranch(createTenantContext(organizationB), membershipB.id, branchB.id) && !await canAccessBranch(createTenantContext(organizationB), membershipB.id, branchBBlocked.id));
  pass("target permission override applied", await hasPermission(currentB, "ORDER_CANCEL"));

  const attackSession = async () => db.authSession.create({ data: { organizationId: organizationA, userId, membershipId: membershipA.id, tokenHash: hashSessionToken(randomUUID()), expiresAt: new Date(Date.now() + 60_000) } });
  let attack = await attackSession();
  pass("organization id is not a membership", await rejects(() => rotateOrganizationSession({ currentSessionId: attack.id, userId, targetMembershipId: organizationB })));
  attack = await attackSession();
  pass("another user membership rejected", await rejects(() => rotateOrganizationSession({ currentSessionId: attack.id, userId, targetMembershipId: otherMembership.id })));
  attack = await attackSession();
  pass("inactive membership rejected", await rejects(() => rotateOrganizationSession({ currentSessionId: attack.id, userId, targetMembershipId: inactiveMembership.id })));
  pass("unauthenticated switch rejected", await rejects(() => rotateOrganizationSession({ currentSessionId: randomUUID(), userId, targetMembershipId: membershipB.id })));

  const switchedBack = await rotateOrganizationSession({ currentSessionId: switched.id, userId, targetMembershipId: membershipA.id });
  pass("switch B to A", switchedBack.organizationId === organizationA && switchedBack.membershipId === membershipA.id);
  pass("B session revoked after switch back", Boolean((await db.authSession.findUniqueOrThrow({ where: { id: switched.id } })).revokedAt));
  const actionSource = await (await import("node:fs/promises")).readFile("app/organization-actions.ts", "utf8");
  pass("server action origin protection retained", actionSource.includes('"use server"') && actionSource.includes("getCurrentSession"));

  await cleanup();
  pass("fixtures cleaned", await db.organization.count({ where: { slug: { startsWith: "organization-switch-" } } }) === 0);
  console.log(`ORGANIZATION SWITCHING targeted: ${passed}/17 passed`);
}

main().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
