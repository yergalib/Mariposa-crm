import "dotenv/config";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { planCatalogPhotoImport } from "../lib/catalog/photo-import-plan";

async function main() {
  const [manifestPath, command, assetsPath] = process.argv.slice(2);
  if (!manifestPath || !["--plan", "--apply"].includes(command ?? "")) {
    throw new Error("Usage: node --import tsx scripts/photo-import.ts <manifest.json> --plan | --apply <assets-directory>");
  }
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  const plan = planCatalogPhotoImport(manifest);
  const summary = { organizationId: plan.organizationId, source: plan.source, photos: plan.rows.length, products: new Set(plan.rows.map((row) => row.productId)).size, excluded: plan.excluded };
  console.log(JSON.stringify(summary, null, 2));
  if (command === "--plan") return;
  if (!assetsPath || process.env.PHOTO_IMPORT_CONFIRM_ORGANIZATION !== plan.organizationId) {
    throw new Error("Applying requires an assets directory and PHOTO_IMPORT_CONFIRM_ORGANIZATION matching the manifest organization ID.");
  }
  const assetPath = (row: (typeof plan.rows)[number]) => {
    const extension = row.mimeType === "image/jpeg" ? "jpg" : row.mimeType === "image/png" ? "png" : "webp";
    return path.join(path.resolve(assetsPath), `${row.sourceFileId}.${extension}`);
  };
  // Fail before the first write if the staged download is incomplete.
  for (const row of plan.rows) {
    const file = await stat(assetPath(row));
    if (file.size !== row.size) throw new Error(`Source size mismatch for ${row.sourceFileId}.`);
  }
  const [{ uploadProductImage }, { createTenantContext }] = await Promise.all([
    import("../lib/catalog/images"), import("../lib/tenant/context")
  ]);
  const tenant = createTenantContext(plan.organizationId);
  let completed = 0;
  for (const row of plan.rows) {
    const bytes = await readFile(assetPath(row));
    await uploadProductImage(tenant, {
      productId: row.productId,
      executionId: row.executionId,
      file: new File([bytes], row.sourceName, { type: row.mimeType }),
      altText: row.executionName ? `${row.productName}, ${row.executionName}` : row.productName,
      importSourceId: row.sourceFileId
    });
    completed++;
    if (completed % 25 === 0 || completed === plan.rows.length) console.log(`Imported ${completed}/${plan.rows.length}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
