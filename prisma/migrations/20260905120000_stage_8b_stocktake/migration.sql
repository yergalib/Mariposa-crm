-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('IN_PROGRESS', 'COUNTED', 'RECONCILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StocktakeScanClassification" AS ENUM ('MATCHED', 'WRONG_LOCATION', 'WRONG_BRANCH', 'UNEXPECTED');

-- CreateEnum
CREATE TYPE "StocktakeResolution" AS ENUM ('MARK_LOST', 'ACCEPT_LOCATION', 'ACCEPT_TRANSFER', 'FOUND', 'APPLY_ADJUSTMENT', 'ACKNOWLEDGED');





-- CreateTable
CREATE TABLE "stocktake_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "started_by_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_by_user_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "reconciled_by_user_id" UUID,
    "reconciled_at" TIMESTAMPTZ(3),
    "cancelled_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "stocktake_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_expected_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "product_instance_id" UUID NOT NULL,
    "expected_branch_id" UUID NOT NULL,
    "expected_location_id" UUID NOT NULL,
    "expected_status" "ProductInstanceOperationalStatus" NOT NULL,
    "expected_version" INTEGER NOT NULL,
    "resolution" "StocktakeResolution",
    "resolution_reason" TEXT,
    "movement_id" UUID,

    CONSTRAINT "stocktake_expected_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_scans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "product_instance_id" UUID NOT NULL,
    "classification" "StocktakeScanClassification" NOT NULL,
    "scanned_by_user_id" UUID NOT NULL,
    "scanned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observed_version" INTEGER NOT NULL,
    "resolution" "StocktakeResolution",
    "resolution_reason" TEXT,
    "movement_id" UUID,

    CONSTRAINT "stocktake_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_bulk_counts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "expected_quantity" INTEGER NOT NULL,
    "counted_quantity" INTEGER,
    "expected_updated_at" TIMESTAMPTZ(3),
    "resolution" "StocktakeResolution",
    "resolution_reason" TEXT,
    "movement_id" UUID,

    CONSTRAINT "stocktake_bulk_counts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stocktake_sessions_organization_id_status_started_at_idx" ON "stocktake_sessions"("organization_id", "status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_sessions_organization_id_idempotency_key_key" ON "stocktake_sessions"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "stocktake_expected_items_organization_id_session_id_idx" ON "stocktake_expected_items"("organization_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_expected_items_session_id_product_instance_id_key" ON "stocktake_expected_items"("session_id", "product_instance_id");

-- CreateIndex
CREATE INDEX "stocktake_scans_organization_id_session_id_classification_idx" ON "stocktake_scans"("organization_id", "session_id", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_scans_session_id_product_instance_id_key" ON "stocktake_scans"("session_id", "product_instance_id");

-- CreateIndex
CREATE INDEX "stocktake_bulk_counts_organization_id_session_id_idx" ON "stocktake_bulk_counts"("organization_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_bulk_counts_session_id_product_variant_id_key" ON "stocktake_bulk_counts"("session_id", "product_variant_id");








-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_reconciled_by_user_id_fkey" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_expected_items" ADD CONSTRAINT "stocktake_expected_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stocktake_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_expected_items" ADD CONSTRAINT "stocktake_expected_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_expected_items" ADD CONSTRAINT "stocktake_expected_items_product_instance_id_fkey" FOREIGN KEY ("product_instance_id") REFERENCES "product_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_scans" ADD CONSTRAINT "stocktake_scans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stocktake_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_scans" ADD CONSTRAINT "stocktake_scans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_scans" ADD CONSTRAINT "stocktake_scans_product_instance_id_fkey" FOREIGN KEY ("product_instance_id") REFERENCES "product_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_scans" ADD CONSTRAINT "stocktake_scans_scanned_by_user_id_fkey" FOREIGN KEY ("scanned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_bulk_counts" ADD CONSTRAINT "stocktake_bulk_counts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stocktake_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_bulk_counts" ADD CONSTRAINT "stocktake_bulk_counts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_bulk_counts" ADD CONSTRAINT "stocktake_bulk_counts_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
