import type {ProductInstanceOperationalStatus}from"@/generated/prisma/client";
export const PHYSICALLY_EXPECTED_STATUSES:readonly ProductInstanceOperationalStatus[]=["AVAILABLE","PICKING","READY_FOR_PICKUP","RETURN_INSPECTION","CLEANING","REPAIR"];
export function isPhysicallyExpected(status:ProductInstanceOperationalStatus,retiredAt:Date|null){return !retiredAt&&PHYSICALLY_EXPECTED_STATUSES.includes(status)}
