import 'server-only';
import {recordTurn,reviewRecordedTurn} from '../chat/recorded-turn';
import {openAIProvider} from '../chat/provider';
import {assertProviderTurnBudget} from '../chat/provider-budget';
import {CONSULTATION_LIMITS} from '../chat/consultation';
import type {CrmToolRunner} from '../chat/tools';
import type {TelegramPorts,TelegramScope} from './adapter';

// Shares the actual planner, reviewer, immutable receipts and daily budget with
// WEB. The caller must supply freshly authorized tools; never fake a WEB session.
export function telegramEngine(authorize:TelegramPorts['authorize'],
  tools:(scope:TelegramScope)=>Promise<CrmToolRunner>,signal:AbortSignal):Pick<TelegramPorts,'plan'|'review'>{
  const provider=(scope:TelegramScope,planning:boolean)=>{
    let calls=0;
    return {async create(...args:Parameters<ReturnType<typeof openAIProvider>['create']>){
      await authorize(scope);
      if(planning&&calls===0)await assertProviderTurnBudget(scope);
      if(++calls>(planning?CONSULTATION_LIMITS.modelCalls-1:1))throw new Error('Telegram call limit');
      return openAIProvider(scope,{checkpointOnly:planning}).create(...args);
    }};
  };
  return {
    async plan(scope,input){await authorize(scope);return recordTurn(input,provider(scope,true),await tools(scope),signal);},
    async review(scope,turn){await authorize(scope);return reviewRecordedTurn(turn,provider(scope,false),await tools(scope),signal);},
  };
}
