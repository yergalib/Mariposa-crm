# Colour navigation (Preview only)

Owner decision: replace the main occasion chooser with nine colour groups. Sizes remain filters/options of the existing model/execution; no product duplication or database renaming.

Read-only grounding: queried only aggregated Product.color and ProductExecution.name values in the existing PILOT tenant. Model colour fields were empty; execution labels contained both single colours and mixed/non-colour descriptions. No writes, customer records, credentials, or migrations were involved.

One resolver classifies exact supported colour names (existing normalization handles case, whitespace, ё/е and grammatical endings). Blue combines Синий/Голубой; champagne-beige combines Шампань/Бежевый. Other requested groups map to their named single colour. No dominant colour is inferred from mixtures, accents, photos or unknown text. Remaining known colours and unknown/mixed descriptors go to Other with the original descriptor; empty values say “Цвет не указан”. Milk/ivory and ambiguous shades are not silently relabelled white/beige. Execution evidence takes precedence over model colour.

Both browse and dated catalog apply this resolver before group pagination. Reads are bounded: 2,000 candidate model/execution groups and 256 size rows per returned page; exceeding a bound requests narrower filters instead of truncating. The usual tenant/publication/active guards remain. No operation-policy overrides or schema changes are included.

Undated cards show catalog size labels (restricted to the size filter when used), never stock availability. Dated cards use shared getVariantAvailability for the public branch/local period. Prices and reservations are unchanged. No inquiry/order/stock write is introduced.

Colour, size, branch and date filters are native GET criteria carried through search/category/page/product/back links. Product entry prioritizes explicit URL criteria over older tab drafts, without restoring an availability claim. Occasion remains optional conversation context. Neutral swatches are labelled approximate; no image/photograph is inferred or newly published because the current public DTO has no approved photo field.

Validation: synthetic shared-service tests cover both two-colour groups over three pages, case/ё/whitespace, mixed/unknown/empty values, size+dates, shared availability, URL roundtrips and tenant/publication refusal. Existing browse, single-colour, grouping, rendered home, product, calendar and tab-state checks were run. Typecheck/lint/build use no real database. Native history/mobile layout still requires real Preview browser review; mock tests are not iPhone acceptance.
