# Purchase submit incident and local recovery

Observed user report:6203 purple,height150,25000KZT,MAIN Astana,21Oct20:33Almaty; generic503 with retained idempotency payload. No contact is copied into evidence.

Read-only MAIN query found zero WEBSITE inquiries between15:15 and16:15UTC on21Oct. At query time about15:35UTC this establishes no committed matching inquiry, not that the browser request was never attempted. Do not create a second key or automatically replay.

Vercel access restored. Deployment dpl_2KxsftYYXuKe6FYrawVVRweCbthk logs contain POST /api/showroom/inquiries at15:32:31.677UTC, requestd2fwv-1792596740485-fa21f20f101e, with pg deprecation warning about concurrent queries on a client. No underlying caught exception was logged by the old route. The warning alone does NOT prove timeout or explain the503. Host matches stable Preview. Guard expiry/validation errors have specific messages; generic503 means an unclassified exception, not proof of a particular schema/enum error.

Confirmed code defect/risk: the transaction performs requireInquiryIntake using global db while holding a transaction connection, twice. Pool max2; concurrent transactions can occupy both slots and wait on global-pool auth reads. Purchase also performs capacity checks within the unchanged10second transaction. Prior fixture stubs did not model this connection dependency.

Local patch:
- Transaction authorization uses tx.authSession to revalidate exact session/user/org/membership, expiry/revocation and active states/OWNER role, then existing permission policy and DB-clock window. It runs both before processing and after persistence, so rollback remains on expired/revoked access. No global-pool auth read inside this transaction.
- No change to price/capacity validation, idempotency, atomic inquiry/audit persistence, timeout, schema, access window, budget or public access.
- Unexpected route errors emit only allowlisted Prisma code or unclassified. No error message, query arguments, contact, session token or payload is logged. Client retains its uncertain-delivery key.

This is a safe local mitigation of a reproducible connection dependency, NOT a proven root cause for this user's historical request. A next authorized attempt and safe diagnostic result are needed to establish live recovery. Do not claim the form fixed based on mocks.

Synthetic checks:13 transaction guard cases including occupied global pool, revocation/expiry/foreign membership/tenant and closed window;7 purchase service groups including price/stock/idempotency;10 owner-day groups including rollback and receipt. No real inquiry or provider call was made. Final build evidence reported with the commit.

If a live mutation is separately approved: exactly one inquiry for6203,purple,height150,MAIN Astana,server25000KZT,contact owner-purchase-verification@example.invalid,clearly marked by that synthetic test contact; creates one NEW WEBSITE inquiry and its audit only, no sale/order/payment/reservation. The existing user's retained payload must not be replayed by automation. Check outcome first after any uncertain response.
