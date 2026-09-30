# RemOnline open order reconciliation

This document defines a read-only procedure for comparing open rental obligations in RemOnline with MARIPOSA CRM. The actual source snapshot, order numbers, customer information, notes, payments, and deposits must remain outside this public repository.

## Source and target

- Scope each source query to one branch, all creation dates, and the non-closed status groups. Record the filter, retrieval time, count, and status totals in a private review artifact. Repeat for every branch.
- Query the Production MARIPOSA organization separately from any pilot tenant. Count open rentals and compare by branch. Do not infer a match from equal row counts or customer names.
- The previously applied opening catalog and stock balance are independent of historic orders. Never create opening stock again while importing obligations.

## Per-order review fields

For each source order, capture the source ID, branch, current status, planned issue and return, customer reference, structured service and product lines, goods mentioned in free-text notes, actual handover state, payments, refunds, deposits, and relevant document references. Keep private data in a controlled location.

Classify each row as `CURRENT_RESERVATION`, `ISSUED_OUTSTANDING`, `STALE_TO_VERIFY`, `CLOSED_IN_FACT`, or `NOT_A_RENTAL`. A status or age alone cannot prove an item is currently out. Require a physical or staff check when the system status conflicts with the expected return date.

Map each physical good to one active CRM variant in the correct branch. Source systems may represent rental as a generic service while listing distinct goods and accessories only in manager notes; these must be reviewed individually. An ambiguous size or customer produces a blocker, not a guessed match.

Reconcile each financial event separately: received versus invoiced rent, outstanding debt, cash advance, held deposit, refund, and write-off. A note mentioning cash does not prove a ledger balance. Historical money must not be posted a second time.

## Read-only diff and stop conditions

The diff should contain source/target identifiers, proposed CRM status and interval, matching confidence and evidence, inventory capacity overlap, unmatched goods, ambiguous customers, finance mismatches, and a stop reason. It must not mutate either system.

Stop on an unverified issued item, overlapping allocation, ambiguous customer or variant, unexplained source-count change, any unbalanced payment or deposit, or a mismatch between structured lines and physical goods in notes. Re-read both systems just before an approved cutover. Preserve source history and use idempotent external identifiers if a later migration is authorized.

The owner must decide how stale orders are handled and when new bookings stop being created in the source system. A separate, reviewable migration plan and acceptance gate are required before any Production write.
