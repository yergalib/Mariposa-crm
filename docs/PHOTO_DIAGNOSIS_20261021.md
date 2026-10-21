# MAIN photograph diagnosis, read-only

Published baseline b277979. Scope: MAIN 2157bde1-1994-465b-9f80-e1b740ee3cb1; active, website-visible model/execution groups with active sizes/variants and inherited operation flags. Counts mirror unfiltered publicBrowse, not a particular search/page. Rental and purchase overlap and must not be added as distinct products.

| Category | Rental (112 models / 150 groups) | Purchase (152 models / 214 groups) |
|---|---:|---:|
| No image record on model |93|143|
| Only deleted image records on model |0|1|
| Active model photo excluded by exact execution linkage |31|42|
| Matching first image exists, required rendition missing |20|19|
| Matching first image and both rendition object records exist |6|9|

All 267 active MAIN image records are model-level: execution_id and product_variant_id NULL. Types:229 JPEG,35 WebP,3 PNG.29 deleted records remain excluded. No active MIME-type exclusion. All267 originals have Storage object metadata;205 have catalogue and205 site rendition metadata.62 lack each required rendition. Object metadata existence does not prove successful delivery or image integrity. No exhaustive network test or authorization failure count is claimed.

Photo selection requires exact execution identity; it deliberately does not use another colour's photograph.29/31 rental and38/42 purchase excluded groups belong to models with multiple active executions. A primary flag cannot repair that linkage. Both modes use publicPhotos/representativePublicPhotos; only the legitimate rental/sale publication predicate differs. No new SALE-only mapping regression identified.

Examples:
- MP-R0884, Платье6118 малыши, product0a08f142-bb99-5591-a555-940af0935495: zero image records including deleted. CRM live card and expanded photo management show no images; white size70 SKU0089.70 has both operation prices. Both showroom modes show placeholder. Requires an actual approved photograph.
- MP-R0082 Венок жемчуг:3 active model photos but white/blue/pink execution groups have no exact image match.0111 Платье2333 Mariposa бархат:5 model photos, pink/blue execution groups excluded. Requires explicit image-to-execution mapping, not automatic cross-colour fallback.
- 0003 Венок мелкие бабочки Роза: selected image0d02091d-ec31-41a9-8eb9-dbe70bf3fde1 has original but no catalogue rendition;0006 Венок белый гипюр жемчуг: b3988094-02ed-41da-9758-9414417fe707 likewise. Showroom never serves private originals; CRM can fall back to signed original. This explains why CRM and showroom can differ. Preparing missing derived objects is a Storage write and is not performed.
- 0065 Платье2325: selected imagea75e823a-88c3-4a75-bf27-555c24a26e99 has original/catalogue metadata. Not evidence that every network request succeeds.

No uploads, deletes, relinks, bucket/RLS/credentials changes. No inferred migration or bulk fallback is implemented. Next decisions: approve preparing62 missing derived image sets without replacing originals; approve reviewed mappings for model photos; supply missing photographs. New permission is not required merely to read existing metadata.

Navigation measurement was interrupted for the higher-priority purchase-submit incident. One measured rental6118 catalogue navigation reached content in6669ms: navigation command182ms,35 UIA reads total1087ms. One purchase navigation did not meet its content marker within60072ms (UIA9605ms/324 reads). This incomplete run is not a valid three-pair benchmark or a diagnosis of network/server latency. Prior fixed sleep3-8seconds is not a measurement. No timeout increased or cache introduced.
