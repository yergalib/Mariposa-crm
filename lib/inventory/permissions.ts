import type { AppRole } from "@/lib/auth/access";
import { InventoryError } from "@/lib/inventory/errors";
export type InventoryAction="READ"|"RECEIPT"|"TRANSFER"|"SENSITIVE";
const roles:Record<InventoryAction,readonly AppRole[]>={READ:["OWNER","DIRECTOR","SELLER","CASHIER"],RECEIPT:["OWNER","DIRECTOR","SELLER"],TRANSFER:["OWNER","DIRECTOR"],SENSITIVE:["OWNER","DIRECTOR"]};
export function requireInventoryPermission(role:AppRole,action:InventoryAction){if(!roles[action].includes(role))throw new InventoryError("FORBIDDEN","Недостаточно прав для складской операции.");}
