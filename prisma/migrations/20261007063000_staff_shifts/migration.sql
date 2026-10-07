CREATE TYPE "StaffShiftStatus" AS ENUM ('PLANNED', 'CANCELLED');
CREATE TABLE "staff_shifts" (
 "id" UUID NOT NULL PRIMARY KEY, "organization_id" UUID NOT NULL,
 "branch_id" UUID NOT NULL, "assigned_membership_id" UUID NOT NULL,
 "starts_at" TIMESTAMPTZ(3) NOT NULL, "ends_at" TIMESTAMPTZ(3) NOT NULL,
 "status" "StaffShiftStatus" NOT NULL DEFAULT 'PLANNED',
 "created_by_user_id" UUID NOT NULL, "creation_key" UUID NOT NULL, "creation_hash" CHAR(64) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "staff_shifts_positive_duration" CHECK ("ends_at" > "starts_at"),
 CONSTRAINT "staff_shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_shifts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_shifts_assigned_membership_id_fkey" FOREIGN KEY ("assigned_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_shifts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_shifts_organization_id_creation_key_key" ON "staff_shifts"("organization_id", "creation_key");
CREATE INDEX "staff_shifts_branch_start_idx" ON "staff_shifts"("organization_id", "branch_id", "starts_at", "id");
CREATE INDEX "staff_shifts_assignee_start_idx" ON "staff_shifts"("organization_id", "assigned_membership_id", "starts_at", "id");
ALTER TABLE "staff_shifts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "staff_shifts" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "staff_shifts" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "staff_shifts" FROM authenticated; END IF;
END $$;
