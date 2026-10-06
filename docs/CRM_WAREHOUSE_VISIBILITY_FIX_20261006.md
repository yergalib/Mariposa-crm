# Warehouse visibility fix — 06.10.2026

The owner saw mostly zero stock rows on `/warehouse`. Read-only Main verification
at 10:26 UTC confirmed 4826 units, 994 active BULK variants, and 68 instances in
8 SERIALIZED variants, all in MARIPOSA Astana. No stock loss was found.

The old BULK query silently returned only 100 of 1052 stock rows, ordered by
updatedAt. Imported rows shared the same timestamp. The observed first100
included all58 zero rows; its first eight SKUs matched the owner's screenshots.
The ordinary search field did not filter this list.

The fix provides case-insensitive name/SKU search before pagination, 100-row
pages ordered by SKU and unique stock-row ID, and exact matching-row/quantity
totals. Count and page share a repeatable-read transaction. Positive stock is the
visible default filter; explicit All / Zero options retain access to every row.
This does not delete or alter zero/inactive stock. Counts describe stock rows by
location, not distinct products. Tenant/branch scope and route permission remain.
SERIALIZED status filtering is separate. Existing Excel export is unchanged and
its full BULK scope is now explained beside the table.

Validation: `node scripts/warehouse-visibility-targeted.cjs` — 6/6 PASS on the
existing isolated full-schema synthetic PostgreSQL with read-only connections.
Verified exhaustive pages/no duplicates or omissions with tied timestamps,
filters/totals/page bounds, case-insensitive name/SKU search, empty/foreign tenant
and branch scope, route DENY, and real local browser navigation/form search.
The UI fixture renders actual InventoryView with auth/AppShell/scan substitutes;
it is not Production authentication testing. Local screenshot inspected.
Targeted TypeScript (changed entrypoints and imports), ESLint and diff checks PASS.
No full regression/build repetition, migration, import, or Production write.

Offset pages are stable for unchanged data. Concurrent inserts/deletes between
separate page requests can shift rows; this is not a cross-request snapshot.

Owner acceptance after an independently authorized release: warehouse shows the
full positive-stock count, next/back pages work, a SKU/name outside old first100
is found, and All/Zero filters show preserved zero rows. No data repair is needed.
