ALTER TABLE "customers"
  ADD COLUMN "created_by_user_id" UUID;

ALTER TABLE "customer_contacts"
  ADD COLUMN "label" TEXT;

ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "customer_contacts_one_primary_per_type"
  ON "customer_contacts"("organization_id", "customer_id", "type")
  WHERE "is_primary" = true;

CREATE TABLE "customer_counters" (
  "organization_id" UUID NOT NULL,
  "next_value" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customer_counters_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "customer_counters_next_value_positive" CHECK ("next_value" > 0),
  CONSTRAINT "customer_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "customer_counters" ("organization_id", "next_value", "updated_at")
SELECT o."id", COALESCE(MAX(CASE WHEN c."customer_number" ~ '^C-[0-9]+$' THEN SUBSTRING(c."customer_number" FROM 3)::BIGINT END), 0) + 1, CURRENT_TIMESTAMP
FROM "organizations" o LEFT JOIN "customers" c ON c."organization_id" = o."id" GROUP BY o."id";

CREATE TABLE "customer_addresses" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "customer_id" UUID NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'OTHER', "country" TEXT, "city" TEXT,
  "address_line" TEXT NOT NULL, "comment" TEXT, "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "customer_addresses_organization_id_customer_id_idx" ON "customer_addresses"("organization_id", "customer_id");
CREATE UNIQUE INDEX "customer_addresses_one_primary" ON "customer_addresses"("organization_id", "customer_id") WHERE "is_primary" = true;

CREATE TABLE "customer_notes" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "customer_id" UUID NOT NULL,
  "text" TEXT NOT NULL, "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3), CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "customer_notes_organization_id_customer_id_created_at_idx" ON "customer_notes"("organization_id", "customer_id", "created_at");

CREATE TABLE "customer_import_batches" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "created_by_user_id" UUID,
  "original_filename" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'UPLOADED',
  "raw_rows" JSONB NOT NULL, "mapping" JSONB, "analysis" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3), CONSTRAINT "customer_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_import_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "customer_import_batches_organization_id_status_expires_at_idx" ON "customer_import_batches"("organization_id", "status", "expires_at");
