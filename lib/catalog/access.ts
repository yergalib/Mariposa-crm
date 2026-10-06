import "server-only";
import { cache } from "react";
import type { AuthContext } from "@/lib/auth/session";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";

// Session grants can retain inactive branches; match the scope used by exports/actions.
export const getCatalogReadScope = cache((session: Pick<AuthContext, "organizationId" | "membershipId">) =>
  accessibleBranchIds(createTenantContext(session.organizationId), session.membershipId));
