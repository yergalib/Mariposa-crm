import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {authorizeTelegramOwner} from './owner';
import type {TelegramScope} from './adapter';
const context=new AsyncLocalStorage<Readonly<TelegramScope>>();
export async function withTelegramCatalog<T>(scope:TelegramScope,read:()=>Promise<T>):Promise<T>{
  await authorizeTelegramOwner(scope);
  return context.run(Object.freeze({...scope}),read);
}
export async function telegramCatalogOrganization(){
  const scope=context.getStore();
  if(!scope)return null;
  await authorizeTelegramOwner(scope); // Fresh check at every service entry.
  return scope.organizationId;
}
export function telegramCatalogBranch(){return context.getStore()?.branchId;}
