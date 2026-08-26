import "server-only";

import { canPerformCatalogAction, type CatalogAction, type AppRole } from "@/lib/auth/access";
import { CatalogError } from "@/lib/catalog/errors";

export function requireCatalogPermission(role: AppRole, action: CatalogAction) {
  if (!canPerformCatalogAction(role, action)) {
    throw new CatalogError("FORBIDDEN", "Недостаточно прав для выполнения операции.");
  }
}
