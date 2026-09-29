import { readFileSync } from "node:fs";

let passed = 0;
function ok(value: unknown, name: string) {
  if (!value) throw new Error(`FAIL ${name}`);
  passed++;
}

const db = readFileSync("lib/db.ts", "utf8");
const permissions = readFileSync("lib/permissions/effective.ts", "utf8");
const orders = readFileSync("app/orders/page.tsx", "utf8");
const sale = readFileSync("components/SaleOrderDetail.tsx", "utf8");
const operations = readFileSync("app/warehouse/operations/page.tsx", "utf8");
const inventory = readFileSync("components/InventoryView.tsx", "utf8");
const calendar = readFileSync("lib/calendar/queries.ts", "utf8");

ok((db.match(/new PrismaClient/g) ?? []).length === 1, "one canonical runtime PrismaClient constructor");
ok(db.includes("max: 1"), "serverless pg pool is capped at one connection per warm instance");
ok(db.includes("globalForPrisma.prisma = db") && !db.includes('NODE_ENV !== "production"'), "singleton is reused in production and development");
ok(permissions.includes("const loadEffectivePermissionKeys = cache("), "effective permissions are request memoized");
ok(orders.includes("getEffectivePermissions(s)") && !orders.includes("hasPermission(s"), "orders loads one permission snapshot");
ok(sale.includes("getEffectivePermissions(session)") && !sale.includes("Promise.all([\n    hasPermission"), "sale detail loads one permission snapshot");
ok(operations.includes("getEffectivePermissions(session)") && !operations.includes("Promise.all([hasPermission"), "warehouse operations loads one permission snapshot");
ok(!inventory.includes("Promise.all(branches.map(async"), "warehouse branch lookup has bounded query scheduling");
ok(!calendar.includes("variants.flatMap((v) =>\n        branchIds.map(async"), "calendar availability has bounded query scheduling");

console.log(`DB connection stability targeted: ${passed}/${passed} passed`);
