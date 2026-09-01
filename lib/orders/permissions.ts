import "server-only";import {canPerformOrderAction,type AppRole,type OrderAction}from "@/lib/auth/access";import{OrderError}from"@/lib/orders/errors";
export function requireOrderPermission(role:AppRole,action:OrderAction){if(!canPerformOrderAction(role,action))throw new OrderError("FORBIDDEN","Недостаточно прав для операции с заказом.");}
