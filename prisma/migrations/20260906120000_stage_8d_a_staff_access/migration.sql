ALTER TABLE "users" ADD COLUMN "first_name" TEXT;
ALTER TABLE "users" ADD COLUMN "last_name" TEXT;

UPDATE "users" SET "email" = lower(btrim("email"));
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users" (lower(btrim("email")));

CREATE TABLE "membership_branch_accesses" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_branch_accesses_pkey" PRIMARY KEY ("id")
);

INSERT INTO "membership_branch_accesses" ("id", "organization_id", "membership_id", "branch_id")
SELECT gen_random_uuid(), m."organization_id", m."id", m."default_branch_id"
FROM "organization_memberships" m
WHERE m."default_branch_id" IS NOT NULL AND m."role" <> 'OWNER';

CREATE UNIQUE INDEX "membership_branch_accesses_membership_id_branch_id_key" ON "membership_branch_accesses"("membership_id", "branch_id");
CREATE INDEX "membership_branch_accesses_organization_id_branch_id_idx" ON "membership_branch_accesses"("organization_id", "branch_id");

CREATE TABLE "staff_invitations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "first_name" TEXT,
  "last_name" TEXT,
  "role" "MembershipRole" NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "default_branch_id" UUID,
  "invited_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");
CREATE INDEX "staff_invitations_organization_id_email_expires_at_idx" ON "staff_invitations"("organization_id", "email", "expires_at");

CREATE TABLE "staff_invitation_branches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "invitation_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  CONSTRAINT "staff_invitation_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_invitation_branches_invitation_id_branch_id_key" ON "staff_invitation_branches"("invitation_id", "branch_id");
CREATE INDEX "staff_invitation_branches_organization_id_branch_id_idx" ON "staff_invitation_branches"("organization_id", "branch_id");

ALTER TABLE "membership_branch_accesses" ADD CONSTRAINT "membership_branch_accesses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_branch_accesses" ADD CONSTRAINT "membership_branch_accesses_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_branch_accesses" ADD CONSTRAINT "membership_branch_accesses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_default_branch_id_fkey" FOREIGN KEY ("default_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invitation_branches" ADD CONSTRAINT "staff_invitation_branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invitation_branches" ADD CONSTRAINT "staff_invitation_branches_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "staff_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invitation_branches" ADD CONSTRAINT "staff_invitation_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
