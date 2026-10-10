import "server-only";
import { ZodError } from "zod";
import { OrderError } from "@/lib/orders/errors";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { FinanceError } from "@/lib/finance/errors";
import { CatalogError } from "@/lib/catalog/errors";
import { InventoryError } from "@/lib/inventory/errors";
import { CustomerError } from "@/lib/customers/errors";
/** Do not log messages, payloads, SQL, passwords, or stacks from untrusted input. */
export function safeActionError(error:unknown, operation:string){
 if(error instanceof ZodError){console.warn("action_validation",{operation,issueCount:error.issues.length});return "Проверьте обязательные поля, количество и формат значений.";}
 if(error instanceof OrderError||error instanceof FulfillmentError||error instanceof FinanceError||error instanceof CatalogError||error instanceof InventoryError||error instanceof CustomerError){
   console.warn("action_rejected",{operation,code:error.code});
   return /[А-Яа-яЁё]/.test(error.message)?error.message:"Операция недоступна. Проверьте данные и состояние заказа.";
 }
 if(error instanceof Error && ["Недостаточно прав для операции.","Филиал недоступен."].includes(error.message))return error.message;
 console.warn("action_failed",{operation,category:error instanceof SyntaxError?"INPUT_FORMAT":error instanceof RangeError?"INPUT_RANGE":"UNEXPECTED"});
 return error instanceof SyntaxError||error instanceof RangeError?"Проверьте формат чисел и значений формы.":"Операция не выполнена. Проверьте данные и повторите попытку.";
}
