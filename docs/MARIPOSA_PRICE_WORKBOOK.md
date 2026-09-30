# MARIPOSA price workbook intake

The owner workbook has one active-variant row per variant on `Цены` (header row 7). Staff edit only columns I and J: rental and sale prices in whole KZT. Empty means leave that price untouched. `Архив` is informational and never enters the price plan.

`lib/catalog/price-workbook.ts` parses the template, rejects formulas and invalid amounts, verifies the variant UUID, model UUID, SKU, internal code, active status, product permissions, duplicates and missing active variants against a fresh CRM catalog snapshot. The original generated workbook uses namespace-prefixed OOXML, which ExcelJS does not read directly, so a narrowly scoped fallback reads its `Цены` sheet. Files saved by Excel use the usual ExcelJS path.

After the completed workbook is returned, run a **read-only** preview with database access:

```bash
node --import tsx scripts/preview-price-workbook.ts /path/to/completed.xlsx ORGANIZATION_UUID
```

The command prints `READY_FOR_REVIEW` only when the workbook matches the current tenant catalog. It reports filled prices, proposed changes, unchanged existing prices, and blocking errors. It never writes to Production. Review the plan and obtain the owner's authorization for the actual Production price update in a separate step. Recheck the catalog and current prices immediately before that update. Existing order price snapshots remain historical.
