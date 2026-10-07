CREATE TYPE "StaffTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TABLE "staff_tasks" (
 "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "branch_id" UUID NOT NULL,
 "title" VARCHAR(200) NOT NULL CHECK (length(btrim("title")) > 0), "description" VARCHAR(4000),
 "assigned_membership_id" UUID NOT NULL, "due_at" TIMESTAMPTZ(3) NOT NULL,
 "status" "StaffTaskStatus" NOT NULL DEFAULT 'OPEN', "customer_id" UUID, "order_id" UUID,
 "created_by_user_id" UUID NOT NULL, "creation_key" UUID NOT NULL, "creation_hash" CHAR(64) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0), "completed_at" TIMESTAMPTZ(3),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "staff_tasks_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "staff_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_tasks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_tasks_assigned_membership_id_fkey" FOREIGN KEY ("assigned_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "staff_tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staff_tasks_organization_id_creation_key_key" ON "staff_tasks"("organization_id", "creation_key");
CREATE INDEX "staff_tasks_organization_id_branch_id_status_due_at_id_idx" ON "staff_tasks"("organization_id", "branch_id", "status", "due_at", "id");
CREATE INDEX "staff_tasks_assignee_status_due_idx" ON "staff_tasks"("organization_id", "assigned_membership_id", "status", "due_at", "id");
CREATE INDEX "staff_tasks_customer_id_idx" ON "staff_tasks"("customer_id");
CREATE INDEX "staff_tasks_order_id_idx" ON "staff_tasks"("order_id");
ALTER TABLE "staff_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "staff_tasks" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "staff_tasks" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "staff_tasks" FROM authenticated; END IF;
END $$;
