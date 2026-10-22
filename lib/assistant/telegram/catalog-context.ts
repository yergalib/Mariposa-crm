import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {authorizeTelegramOwner} from './owner';
import {authorizeCustomer} from './customer-access';
import type {TelegramScope} from './adapter';
const context=new AsyncLocalStorage<Readonly<TelegramScope & {customer?:true}>>();
export async function withTelegramCatalog<T>(scope:TelegramScope,read:()=>Promise<T>):Promise<T>{
  await authorizeTelegramOwner(scope);
  return context.run(Object.freeze({...scope}),read);
}
export async function withCustomerCatalog<T>(scope:TelegramScope,read:()=>Promise<T>):Promise<T>{
 await authorizeCustomer(scope);return context.run(Object.freeze({...scope,customer:true}),read);
}
export async function telegramCatalogOrganization(){
  const scope=context.getStore();
  if(!scope)return null;
  if(scope.customer)await authorizeCustomer(scope);else await authorizeTelegramOwner(scope); // Fresh, distinct authorization.
  return scope.organizationId;
}
export function telegramCatalogBranch(){return context.getStore()?.branchId;}
