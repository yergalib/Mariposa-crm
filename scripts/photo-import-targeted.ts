import assert from "node:assert/strict";
import { planCatalogPhotoImport } from "../lib/catalog/photo-import-plan";

const photo = { id: "file_1234567890", name: "old.jpg", mime: "image/jpeg", size: 128 };
const manifest = {
  organizationId: "00000000-0000-4000-a000-000000000001",
  folders: [
    { source: "фото для сайта 2", legacyCode: "0001", status: "SOURCE_PROVENANCE", productId: "product-1", productName: "Новое название", executionId: "execution-1", executionName: "белый", photos: [photo] },
    { source: "фото для сайта 2", legacyCode: "0002", status: "REVIEW", productId: "product-2", productName: "Другой товар", executionId: null, executionName: null, photos: [{ ...photo, id: "file_1234567891" }] },
    { source: "фото для сайта 2", legacyCode: "0003", status: "NO_PRODUCT", productId: null, productName: null, executionId: null, executionName: null, photos: [{ ...photo, id: "file_1234567892" }] },
    { source: "фото для сайта", legacyCode: "0004", status: "PRODUCT_ONLY", productId: "product-3", productName: "Старый источник", executionId: null, executionName: null, photos: [{ ...photo, id: "file_1234567893" }] }
  ]
};
const plan = planCatalogPhotoImport(manifest);
assert.equal(plan.rows.length, 1);
assert.equal(plan.rows[0].productName, "Новое название");
assert.equal(plan.rows[0].executionId, "execution-1");
assert.deepEqual(plan.excluded.map((item) => item.reason), ["REVIEW_EXECUTION", "NO_PRODUCT"]);
assert.throws(() => planCatalogPhotoImport({ ...manifest, folders: [manifest.folders[0], manifest.folders[0]] }), /Duplicate source file/);
console.log("Photo import targeted: 5/5 passed");
