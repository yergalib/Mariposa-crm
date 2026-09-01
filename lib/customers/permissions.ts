import "server-only";
import {canPerformCustomerAction,type AppRole,type CustomerAction} from "@/lib/auth/access";
import {CustomerError} from "@/lib/customers/errors";
export function requireCustomerPermission(role:AppRole,action:CustomerAction){if(!canPerformCustomerAction(role,action))throw new CustomerError("FORBIDDEN","Недостаточно прав для операции с клиентами.");}
