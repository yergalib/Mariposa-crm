import "dotenv/config";

import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { CatalogError } from "../lib/catalog/errors";
import { deleteProductImage, getSignedProductImageUrl, reorderProductImages, setPrimaryProductImage, uploadProductImage } from "../lib/catalog/images";
import { getStorageClient, PRODUCT_IMAGES_BUCKET } from "../lib/storage/client";
import { createTenantContext } from "../lib/tenant/context";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function expectCatalogError(operation: () => Promise<unknown>, code?: string) {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof CatalogError, "Expected a safe catalog error.");
    if (code) assert(error.code === code, `Expected ${code}, received ${error.code}.`);
    return;
  }
  throw new Error("Expected operation to be rejected.");
}

async function expectRejected(operation: () => Promise<unknown>) {
  try { await operation(); } catch { return; }
  throw new Error("Expected operation to be rejected.");
}

const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA", "base64");

const organizationId = randomUUID();
const otherOrganizationId = randomUUID();
const uploadedKeys = new Set<string>();
let bucketExisted = false;
let testProductId: string | null = null;

async function objectExists(key: string) {
  const client = getStorageClient();
  assert(client, "Storage configuration is unavailable.");
  const { data, error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).download(key);
  return !error && Boolean(data);
}

async function cleanup() {
  const client = getStorageClient();
  if (client && testProductId) {
    const path = `organizations/${organizationId}/products/${testProductId}`;
    const listed = await client.storage.from(PRODUCT_IMAGES_BUCKET).list(path, { limit: 1000 });
    for (const item of listed.data ?? []) uploadedKeys.add(`${path}/${item.name}`);
  }
  if (client && uploadedKeys.size) await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([...uploadedKeys]);
  await db.productImage.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  await db.product.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  await db.inventoryCounter.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
}

async function main() {
  const storage = getStorageClient();
  assert(storage, "SUPABASE_URL and server-only Storage key must be configured.");
  const existingBucket = await storage.storage.getBucket(PRODUCT_IMAGES_BUCKET);
  bucketExisted = Boolean(existingBucket.data);

  await db.organization.createMany({ data: [
    { id: organizationId, name: "Storage smoke tenant", slug: `storage-smoke-${organizationId.slice(0, 8)}` },
    { id: otherOrganizationId, name: "Storage isolation tenant", slug: `storage-isolation-${otherOrganizationId.slice(0, 8)}` }
  ] });
  const product = await db.product.create({ data: { organizationId, name: "Storage smoke product", internalCode: `STORAGE-${organizationId.slice(0, 8)}`, publicationStatus: "ACTIVE" } });
  testProductId = product.id;
  const tenant = createTenantContext(organizationId);
  const otherTenant = createTenantContext(otherOrganizationId);

  const first = await uploadProductImage(tenant, { productId: product.id, file: new File([jpeg], "one.jpg", { type: "image/jpeg" }), altText: "JPEG smoke" });
  uploadedKeys.add(first.storageKey);
  assert(new RegExp(`^organizations/${organizationId}/products/${product.id}/[0-9a-f-]+\\.jpg$`).test(first.storageKey), "Unexpected tenant-aware object key.");
  assert(first.isPrimary && first.width === 1 && first.height === 1, "JPEG metadata or initial primary is incorrect.");

  const bucket = await storage.storage.getBucket(PRODUCT_IMAGES_BUCKET);
  assert(bucket.data && bucket.data.public === false, "Bucket must exist and remain private.");
  const signedUrl = await getSignedProductImageUrl(first.storageKey);
  assert(signedUrl, "Signed preview URL was not created.");
  const preview = await fetch(signedUrl);
  assert(preview.ok && (await preview.arrayBuffer()).byteLength === jpeg.byteLength, "Signed preview could not be read.");

  const second = await uploadProductImage(tenant, { productId: product.id, file: new File([png], "two.png", { type: "image/png" }) });
  uploadedKeys.add(second.storageKey);
  assert(!second.isPrimary && second.mimeType === "image/png", "Second image metadata is incorrect.");
  await reorderProductImages(tenant, product.id, [second.id, first.id]);
  const ordered = await db.productImage.findMany({ where: { organizationId, productId: product.id, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } });
  assert(ordered[0]?.id === second.id && ordered[1]?.id === first.id, "Image reorder failed.");
  await setPrimaryProductImage(tenant, second.id);
  assert(await db.productImage.count({ where: { organizationId, productId: product.id, status: "ACTIVE", isPrimary: true } }) === 1, "Primary image change failed.");

  const third = await uploadProductImage(tenant, { productId: product.id, file: new File([webp], "three.webp", { type: "image/webp" }) });
  uploadedKeys.add(third.storageKey);
  assert(third.mimeType === "image/webp", "WebP upload failed.");

  await expectCatalogError(() => uploadProductImage(tenant, { productId: product.id, file: new File([png], "bad.gif", { type: "image/gif" }) }), "UNSUPPORTED_IMAGE");
  await expectCatalogError(() => uploadProductImage(tenant, { productId: product.id, file: new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }) }), "IMAGE_TOO_LARGE");
  await expectCatalogError(() => uploadProductImage(tenant, { productId: product.id, file: new File([new Uint8Array([1, 2, 3, 4])], "broken.png", { type: "image/png" }) }), "UNSUPPORTED_IMAGE");
  await expectCatalogError(() => uploadProductImage(otherTenant, { productId: product.id, file: new File([png], "cross.png", { type: "image/png" }) }), "NOT_FOUND");
  await expectCatalogError(() => setPrimaryProductImage(otherTenant, first.id), "NOT_FOUND");

  await expectRejected(async () => {
    await db.productImage.create({ data: { organizationId, productId: product.id, storageKey: `organizations/${organizationId}/constraint.webp`, mimeType: "image/webp", isPrimary: true } });
  });

  const beforeCompensation = new Set((await storage.storage.from(PRODUCT_IMAGES_BUCKET).list(`organizations/${organizationId}/products/${product.id}`)).data?.map(item => item.name) ?? []);
  const originalTransaction = db.$transaction.bind(db);
  (db as unknown as { $transaction: typeof db.$transaction }).$transaction = (async () => { throw new Error("Injected metadata failure"); }) as typeof db.$transaction;
  try {
    try { await uploadProductImage(tenant, { productId: product.id, file: new File([png], "compensate.png", { type: "image/png" }) }); } catch { /* expected */ }
  } finally {
    (db as unknown as { $transaction: typeof db.$transaction }).$transaction = originalTransaction as typeof db.$transaction;
  }
  const afterCompensation = new Set((await storage.storage.from(PRODUCT_IMAGES_BUCKET).list(`organizations/${organizationId}/products/${product.id}`)).data?.map(item => item.name) ?? []);
  assert(beforeCompensation.size === afterCompensation.size && [...beforeCompensation].every(name => afterCompensation.has(name)), "Upload compensation left an orphan object.");

  const realSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = randomUUID();
  try { await expectCatalogError(() => deleteProductImage(tenant, second.id), "STORAGE_UNAVAILABLE"); } finally { process.env.SUPABASE_SECRET_KEY = realSecret; }
  const restored = await db.productImage.findUnique({ where: { id: second.id } });
  assert(restored?.status === "ACTIVE" && restored.isPrimary, "Delete compensation did not restore metadata.");
  assert(await objectExists(second.storageKey), "Delete failure unexpectedly removed the object.");

  await deleteProductImage(tenant, first.id); uploadedKeys.delete(first.storageKey);
  assert(!(await objectExists(first.storageKey)), "Deleted Storage object still exists.");
  await deleteProductImage(tenant, second.id); uploadedKeys.delete(second.storageKey);
  const replacement = await db.productImage.findUnique({ where: { id: third.id } });
  assert(replacement?.isPrimary, "Deleting primary did not select the next image.");
  await deleteProductImage(tenant, third.id); uploadedKeys.delete(third.storageKey);
  assert(await db.productImage.count({ where: { organizationId, status: "ACTIVE" } }) === 0, "Active image metadata remains.");

  return { testU: "PASS", bucketCreated: !bucketExisted, bucketPrivate: true, upload: "PASS", signedRead: "PASS", primary: "PASS", reorder: "PASS", delete: "PASS", validation: "PASS", tenantIsolation: "PASS", dbPrimaryConstraint: "PASS", uploadCompensation: "PASS", deleteCompensation: "PASS" } as const;
}

export async function runStorageSmoke() {
  try { return await main(); }
  finally { await cleanup(); await db.$disconnect(); }
}
