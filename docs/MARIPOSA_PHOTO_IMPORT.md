# MARIPOSA product photos

The current photo workflow is manual upload from a phone into the relevant product in CRM. Staff may select a product execution (color) when uploading. CRM stores the image bytes in the private Supabase Storage bucket `product-images` and keeps the product/execution association, order, and primary flag in `ProductImage`. Product pages generate short-lived signed image URLs.

The earlier Drive folder mapping and bulk-import plan have been superseded by this decision. The legacy import scripts remain in the repository for historical reference and must not be run against Production. No Drive folder rename, copy, or bulk import is part of the current workflow.

To use the same uploaded photo on a future website or bot, create channel-specific delivery or derivative images from the stored source and keep the `ProductImage` association. Do not ask staff to upload the same photo separately for each channel. The current uploader may compress a large or HEIC photo on the phone before storing it, so the stored file is the source available for future derivatives, not necessarily the original camera file.
