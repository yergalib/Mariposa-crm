import { defaultHasPermission, isPermissionKey } from "../lib/permissions/registry";
import { readFileSync } from "node:fs";

let passed=0;const ok=(name:string,value:unknown)=>{if(!value)throw new Error(`FAIL ${name}`);passed++;};
const keys=["PAYMENT_REVERSE","DEPOSIT_VIEW","DEPOSIT_MANAGE","DEPOSIT_REFUND","CUSTOMER_BALANCE_VIEW","AUDIT_LOG_VIEW"] as const;
ok("new keys registered",keys.every(isPermissionKey));
ok("OWNER invariant",keys.every(key=>defaultHasPermission("OWNER",key)));
ok("DIRECTOR operational finance",["PAYMENT_REVERSE","DEPOSIT_VIEW","DEPOSIT_MANAGE","DEPOSIT_REFUND","CUSTOMER_BALANCE_VIEW"].every(key=>defaultHasPermission("DIRECTOR",key as typeof keys[number])));
ok("audit remains OWNER-only",!defaultHasPermission("DIRECTOR","AUDIT_LOG_VIEW"));
ok("SELLER conservative defaults",keys.every(key=>!defaultHasPermission("SELLER",key)));
ok("CASHIER conservative defaults",keys.every(key=>!defaultHasPermission("CASHIER",key)));
const transactionSource=readFileSync("lib/finance/transactions.ts","utf8"),querySource=readFileSync("lib/finance/queries.ts","utf8"),auditSource=readFileSync("lib/audit/queries.ts","utf8");
ok("mutation server permissions",transactionSource.includes("requirePermission")&&transactionSource.includes("PAYMENT_REFUND")&&transactionSource.includes("PAYMENT_REVERSE")&&transactionSource.includes("DEPOSIT_MANAGE"));
ok("read server permissions",querySource.includes("PAYMENT_VIEW")&&querySource.includes("CUSTOMER_BALANCE_VIEW")&&auditSource.includes("AUDIT_LOG_VIEW"));
console.log(`PASS Stage 9A permission regression (${passed} checks)`);
