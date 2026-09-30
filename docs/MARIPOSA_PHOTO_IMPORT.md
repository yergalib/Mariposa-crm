# MARIPOSA photo import

Source: the Drive folder `фото для сайта 2`. The newer CRM-named Drive folder is a non-destructive working copy; original folders remain untouched. The mapping manifest is held separately from this repository as `MARIPOSA_photo_review_manifest_2026-09-29.json`.

Run a read-only plan:

```bash
node --import tsx scripts/photo-import.ts /path/to/MARIPOSA_photo_review_manifest_2026-09-29.json --plan
node --import tsx scripts/photo-import-targeted.ts
```

The reviewed plan selects 640 photos for 107 catalog products. It excludes 19 old folders with no current Product (73 photos), one glove photo whose color cannot be proven, and three photos of a white dress (code 0077) whose only current CRM execution is pink. Do not assign the white photos to the pink execution. The source folders and their photos remain untouched.

For an approved apply, stage the original image bytes as `<Drive file ID>.jpg`, `.png`, or `.webp` in a local assets directory. The command preflights every file's size before the first database/storage write. It requires `PHOTO_IMPORT_CONFIRM_ORGANIZATION` to equal the manifest organization ID and `--apply <assets-directory>`. Never run apply as part of a Preview deployment. The import uses organization-scoped Product and Execution checks and deterministic Storage keys derived from Drive file IDs, so a rerun skips already active images.

Production bulk photo import changes the live catalog and Storage and requires explicit owner approval after the selected 640 files are staged and inspected. The Preview UI can be evaluated without bulk-importing photos.
