-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'DIRECTOR', 'CASHIER', 'SELLER');

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "role" "MembershipRole" NOT NULL DEFAULT 'SELLER';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "password_hash" SET NOT NULL;

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_organization_id_user_id_idx" ON "auth_sessions"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_membership_id_expires_at_idx" ON "auth_sessions"("membership_id", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_revoked_at_idx" ON "auth_sessions"("expires_at", "revoked_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
