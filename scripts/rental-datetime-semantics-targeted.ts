import { readFileSync } from "node:fs";
import { formatBusinessLocalDateTimeInput, parseBusinessLocalDateTime } from "../lib/calendar/timezone";
import { orderSchema } from "../lib/orders/validation";

let passed = 0;
function ok(value: unknown, name: string) { if (!value) throw new Error(`FAIL ${name}`); passed++; }

const zone = "Asia/Almaty", local = "2026-10-07T15:00";
const instant = parseBusinessLocalDateTime(local, zone);
ok(instant.toISOString() === "2026-10-07T10:00:00.000Z", "Astana wall clock persists as correct UTC instant");
ok(formatBusinessLocalDateTimeInput(instant, zone) === local, "Astana local persisted local round trip");

const originalTz = process.env.TZ;
process.env.TZ = "UTC";
const fromUtcProcess = parseBusinessLocalDateTime(local, zone).toISOString();
process.env.TZ = "America/Los_Angeles";
const fromPacificProcess = parseBusinessLocalDateTime(local, zone).toISOString();
if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
ok(fromUtcProcess === fromPacificProcess && fromUtcProcess === instant.toISOString(), "conversion ignores process timezone");

const midnight = parseBusinessLocalDateTime("2026-10-08T00:30", zone);
ok(midnight.toISOString() === "2026-10-07T19:30:00.000Z", "midnight crossing uses business timezone");
ok(formatBusinessLocalDateTimeInput(midnight, zone) === "2026-10-08T00:30", "midnight round trip preserves local date");

const parsed = orderSchema.parse({ branchId: "11111111-1111-4111-8111-111111111111", customerId: "22222222-2222-4222-8222-222222222222", source: "CRM", rentalStart: instant, rentalEnd: midnight, discountMinor: BigInt(0) });
ok(parsed.rentalStart === instant && parsed.rentalEnd === midnight, "order domain accepts already normalized instants without reparsing");

const actions = readFileSync("app/orders/actions.ts", "utf8"), mobileActions = readFileSync("app/orders/mobile-actions.ts", "utf8"), management = readFileSync("lib/orders/management.ts", "utf8"), form = readFileSync("components/OrderForm.tsx", "utf8"), detail = readFileSync("app/orders/[id]/page.tsx", "utf8"), panel = readFileSync("components/RentalOperationalPanel.tsx", "utf8"), calendar = readFileSync("lib/calendar/queries.ts", "utf8");
ok(actions.includes("parseRentalPeriodForBranch") && actions.includes("await base(f,tenant)"), "rental create and edit normalize at server boundary");
ok(mobileActions.includes("parseRentalPeriodForBranch") && !mobileActions.includes("new Date(input.rental"), "availability quote uses identical server boundary");
ok(management.includes("requestedFrom: o.rentalStart") && management.includes("requestedUntil: o.rentalEnd") && management.includes("expectedReturnAt: o.rentalEnd"), "creation availability and expected return share normalized instants");
ok(management.includes("requestedFrom: o.rentalStartAt") && management.includes("requestedUntil: o.rentalEndAt"), "allocation reservation uses persisted corrected interval");
ok(form.includes("formatBusinessLocalDateTimeInput") && form.includes("localDate(order.rentalStartAt,orderTimeZone)"), "edit form preserves business wall clock");
ok(detail.includes("formatBusinessDateTime(order.rentalStartAt,order.branch.timezone)") && panel.includes("formatBusinessDateTime(new Date(expectedReturnAt),timeZone)"), "order detail and expected return render in branch timezone");
ok(calendar.includes("localDateKey(row.rentalStartAt!, timeZone)") && calendar.includes("periodFor(query.view"), "calendar projects persisted instants in business timezone");
ok(!actions.includes('return{branchId:text(f,"branchId"),customerId') && !mobileActions.includes("new Date(input.rentalStart)"), "naive server Date parsing removed");

console.log(`Rental local datetime semantics: ${passed}/${passed} passed`);
