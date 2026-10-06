-- CreateEnum
CREATE TYPE "FittingStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InquiryStatus" ADD VALUE 'SELECTION';
ALTER TYPE "InquiryStatus" ADD VALUE 'FITTING';
ALTER TYPE "InquiryStatus" ADD VALUE 'ORDER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assigned_membership_id" UUID;

-- AlterTable
ALTER TABLE "inquiries" ADD COLUMN     "customer_id" UUID,
ADD COLUMN     "order_id" UUID;

-- CreateTable
CREATE TABLE "fittings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_id" UUID,
    "inquiry_id" UUID,
    "order_id" UUID,
    "guest_name" VARCHAR(120),
    "guest_contact" VARCHAR(254),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "assigned_membership_id" UUID NOT NULL,
    "source" "InquirySource" NOT NULL DEFAULT 'CRM',
    "status" "FittingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "comment" VARCHAR(2000),
    "created_by_user_id" UUID NOT NULL,
    "creation_key" UUID NOT NULL,
    "creation_hash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fittings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitting_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fitting_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT NOT NULL,
    "size_snapshot" TEXT NOT NULL,

    CONSTRAINT "fitting_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fittings_organization_id_branch_id_starts_at_idx" ON "fittings"("organization_id", "branch_id", "starts_at");

-- CreateIndex
CREATE INDEX "fittings_organization_id_assigned_membership_id_starts_at_idx" ON "fittings"("organization_id", "assigned_membership_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "fittings_organization_id_creation_key_key" ON "fittings"("organization_id", "creation_key");

-- CreateIndex
CREATE UNIQUE INDEX "fitting_items_fitting_id_product_variant_id_key" ON "fitting_items"("fitting_id", "product_variant_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_membership_id_fkey" FOREIGN KEY ("assigned_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_assigned_membership_id_fkey" FOREIGN KEY ("assigned_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_items" ADD CONSTRAINT "fitting_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_items" ADD CONSTRAINT "fitting_items_fitting_id_fkey" FOREIGN KEY ("fitting_id") REFERENCES "fittings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_items" ADD CONSTRAINT "fitting_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Service and database agree on fixed appointment duration and identity.
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_duration_check" CHECK (ends_at = starts_at + interval '30 minutes');
ALTER TABLE "fittings" ADD CONSTRAINT "fittings_customer_check" CHECK (customer_id IS NOT NULL OR coalesce(length(trim(guest_name)),0) > 0);
