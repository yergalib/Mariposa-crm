import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { db } from '@/lib/db';
import { requireOwnerDaySession, requireOwnerDayWriteWindow } from '@/lib/assistant/owner-day-access';
import { OWNER_DAY } from '@/lib/assistant/owner-day-config';
import { getStorageClient, PRODUCT_IMAGES_BUCKET } from '@/lib/storage/client';
import { renderProductImageRenditions, renditionStorageKey } from './image-renditions';
import manifest from './approved-derivatives-20261021.json';

const kinds = ['catalog', 'site'] as const;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function authorize() {
  // Fixed repair expiry, independent of any later extension of the general owner test.
  if (Date.now() < Date.parse('2026-10-20T19:00:00Z') || Date.now() >= Date.parse('2026-10-25T19:00:00Z'))
    throw new Error('REPAIR_WINDOW_CLOSED');
  await requireOwnerDaySession(['CATALOG_PHOTO_MANAGE']);
  await requireOwnerDayWriteWindow(db);
}
export async function repairStatus() {
  await authorize();
  if (manifest.length !== 62 || new Set(manifest.map(row => row.storageKey)).size !== 62
    || manifest.some(row => !row.storageKey.startsWith(`organizations/${OWNER_DAY.organizationId}/products/${row.productId}/`)))
    throw new Error('MANIFEST_INVALID');
  const keys = manifest.flatMap(row => kinds.map(kind => renditionStorageKey(row.storageKey, kind)));
  const existing = await db.$queryRaw<{ name: string }[]>`SELECT name FROM storage.objects
    WHERE bucket_id = 'product-images' AND name IN
    (SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))`;
  const present = new Set(existing.map(row => row.name));
  return manifest.map(row => ({ ...row, derivatives: kinds.map(kind => ({
    kind, key: renditionStorageKey(row.storageKey, kind), exists: present.has(renditionStorageKey(row.storageKey, kind)),
  })) }));
}

// No caller-supplied image, path, tenant, batch size or cursor. At most two object inserts.
export async function repairNextApprovedSource() {
  const status = await repairStatus();
  const source = status.find(row => row.derivatives.some(item => !item.exists));
  if (!source) return { done: true, results: [] };
  const current = await db.productImage.findFirst({ where: {
    id: source.id, organizationId: OWNER_DAY.organizationId, productId: source.productId,
    storageKey: source.storageKey, executionId: null, productVariantId: null,
    status: 'ACTIVE', deletedAt: null,
  }, select: { id: true } });
  if (!current) throw new Error('SOURCE_METADATA_CHANGED');
  const client = getStorageClient();
  if (!client) throw new Error('STORAGE_UNAVAILABLE');
  const bucket = client.storage.from(PRODUCT_IMAGES_BUCKET);
  const original = await bucket.download(source.storageKey);
  if (original.error || !original.data) throw new Error('SOURCE_DOWNLOAD_FAILED');
  const bytes = new Uint8Array(await original.data.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('SOURCE_SIZE_INVALID');
  const rendered = await renderProductImageRenditions(bytes);
  const results: { key: string; outcome: string; sha256: string; width: number; height: number }[] = [];
  for (const target of source.derivatives) {
    const image = rendered.find(row => row.rendition === target.kind)!;
    const exists = await bucket.exists(target.key);
    if (exists.error) throw new Error('EXISTENCE_CHECK_FAILED');
    let outcome = 'skipped-existing';
    if (!exists.data) {
      // Recheck the ordinary session/permissions and database clock immediately before each insert.
      await authorize();
      const uploaded = await bucket.upload(target.key, image.data, {
        contentType: image.contentType, upsert: false, cacheControl: '3600',
      });
      if (uploaded.error) {
        // A race or an uncertain upload is resolved by readback, never by overwriting.
        const check = await bucket.download(target.key);
        if (check.error || !check.data
          || hash(new Uint8Array(await check.data.arrayBuffer())) !== hash(image.data))
          throw new Error('UPLOAD_UNCONFIRMED');
        outcome = 'present-after-upload-error';
      } else outcome = 'created';
    }
    const readback = await bucket.download(target.key);
    if (readback.error || !readback.data) throw new Error('READBACK_FAILED');
    const actual = new Uint8Array(await readback.data.arrayBuffer());
    const metadata = await sharp(actual).metadata();
    const limit = target.kind === 'catalog' ? 480 : 1600;
    if (metadata.format !== 'webp' || !metadata.width || !metadata.height
      || metadata.width > limit || metadata.height > limit) throw new Error('READBACK_INVALID');
    if (outcome !== 'skipped-existing' && hash(actual) !== hash(image.data)) throw new Error('READBACK_MISMATCH');
    results.push({ key: target.key, outcome, sha256: hash(actual), width: metadata.width, height: metadata.height });
  }
  return { done: false, sourceId: source.id, sourceSha256: hash(bytes), results };
}
