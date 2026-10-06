CREATE TABLE "product_sheet_imports" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "filename" VARCHAR(200) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PREVIEW',
  "rows" JSONB NOT NULL,
  "errors" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "product_sheet_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_sheet_imports_status_check" CHECK ("status" IN ('PREVIEW','APPLIED')),
  CONSTRAINT "product_sheet_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_sheet_imports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "product_sheet_imports_organization_id_status_expires_at_idx" ON "product_sheet_imports"("organization_id","status","expires_at");
ALTER TABLE "product_sheet_imports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "product_sheet_imports" FROM PUBLIC, anon, authenticated;
