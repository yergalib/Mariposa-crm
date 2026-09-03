import type { CustomerAction, FulfillmentAction, OrderAction } from "@/lib/auth/access";
import type { InventoryAction } from "@/lib/inventory/permissions";
import type { PermissionKey } from "@/lib/permissions/registry";
export const customerPermission=(a:CustomerAction):PermissionKey=>({READ_CUSTOMERS:"CUSTOMER_VIEW",WRITE_CUSTOMERS:"CUSTOMER_EDIT",ARCHIVE_CUSTOMERS:"CUSTOMER_ARCHIVE",IMPORT_CUSTOMERS:"CUSTOMER_IMPORT"}[a] as PermissionKey);
export const orderPermission=(a:OrderAction):PermissionKey=>({READ_ORDERS:"ORDER_VIEW",CREATE_ORDERS:"ORDER_CREATE",EDIT_ORDERS:"ORDER_EDIT",RESERVE_ORDERS:"RENTAL_RESERVE",CONFIRM_ORDERS:"RENTAL_CONFIRM",CANCEL_ORDERS:"ORDER_CANCEL"}[a] as PermissionKey);
export const fulfillmentPermission=(a:FulfillmentAction):PermissionKey=>({READ_FULFILLMENT:"ORDER_VIEW",ASSIGN_INSTANCES:"RENTAL_PREPARE",MARK_READY:"RENTAL_PREPARE",ISSUE_ITEMS:"RENTAL_ISSUE",RECEIVE_RETURN:"RETURN_PROCESS",MANAGE_MAINTENANCE:"MAINTENANCE_COMPLETE",COMPLETE_FULFILLMENT:"RETURN_PROCESS"}[a] as PermissionKey);
export const inventoryPermission=(a:InventoryAction):PermissionKey=>({READ:"INVENTORY_VIEW",RECEIPT:"INVENTORY_RECEIVE",TRANSFER:"INVENTORY_TRANSFER",SENSITIVE:"INVENTORY_ADJUST",STOCKTAKE:"STOCKTAKE_COUNT",RECONCILE:"STOCKTAKE_RECONCILE"}[a] as PermissionKey);
