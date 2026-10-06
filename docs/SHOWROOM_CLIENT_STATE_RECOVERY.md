# Client state recovery (local, not deployed)

Independent UI fixes; no schema or server API changes.

- Sale price read: explicit cancel, retry after failure, current-request identity checks, abort on unmount. Branch/size changes remount the keyed offer, so earlier replies cannot populate the new selection. This commit requires the sale UI from the integration branch; it cannot be cherry-picked alone onto a branch without SaleOffer.
- Tab state: four bounded, strictly validated buckets use browser-tab memory as the latest value. Failed sessionStorage writes cannot mask new input with an older stored value. Functional updates and closing/reopening components retain the current input within the same tab/session.
- New conversation, login cleanup, logout and scope changes clear memory even when storage access/removal throws. Failed cleanup is retried before subsequent persistence; old disk values are not read again during this page lifetime. Expired values and expired session deadlines are rejected. No server-side shared state is populated.
- Memory fallback uses the existing field schemas and 30-minute TTL; no new contact, price or availability retention. Four buckets, each at most 14,000 serialized characters. Sensitive-text filtering is not a general guarantee of detecting arbitrary personal data.

Limits: unavailable storage cannot guarantee survival across a full page reload/browser close. Failed physical deletion cannot erase inaccessible disk content; cleanup is retried when possible. This change guarantees clearing the live in-memory state and prevents old disk resurrection within that page lifetime. No claim of secure erasure is made.

Validation: synthetic hook/storage suites cover quota with stale persisted values, disabled storage getter, functional updates, close/remount, schema rejection, new dialog, logout with failed removal, storage recovery, user switch/late writers, TTL/deadline, size/bucket bounds and server guard. Sale UI suite covers network error/retry/cancel and delayed replies across rapid selection changes. These are not real browser/iPhone tests; those remain for Preview verification. No DB/provider/network calls in smoke tests.

The tab-state fix is independent of operation-policy schema changes and can be selected separately for Preview after review. It does not enable public inquiry intake or deploy the integration branch.
