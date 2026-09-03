CREATE TYPE "PermissionOverrideEffect" AS ENUM ('ALLOW', 'DENY');

CREATE TABLE "membership_permission_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "permission_key" VARCHAR(100) NOT NULL,
  "effect" "PermissionOverrideEffect" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_permission_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "membership_permission_overrides_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "membership_permission_overrides_membership_id_fkey"
    FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "membership_permission_overrides_membership_id_permission_key_key"
  ON "membership_permission_overrides"("membership_id", "permission_key");
CREATE INDEX "membership_permission_overrides_organization_id_permission_key_idx"
  ON "membership_permission_overrides"("organization_id", "permission_key");

CREATE OR REPLACE FUNCTION enforce_membership_permission_override_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "organization_memberships" m
    WHERE m."id" = NEW."membership_id"
      AND m."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'permission override membership tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "membership_permission_overrides_tenant_guard"
BEFORE INSERT OR UPDATE ON "membership_permission_overrides"
FOR EACH ROW EXECUTE FUNCTION enforce_membership_permission_override_tenant();
