import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { db } from "../lib/db";
import { getDatabaseUrl } from "../lib/env";

type Scenario="read"|"one"|"many"|"repeatable"|"repeated"|"advisory"|"rollback"|"stress-default"|"stress-repeatable"|"stress-advisory"|"stress-rollback"|"concurrent";
const scenario=(process.argv[2]??"read") as Scenario,mode=process.argv[3]??"singleton";
const stamp=(stage:string)=>console.log(JSON.stringify({at:new Date().toISOString(),pid:process.pid,mode,scenario,stage}));
const watchdogMs=scenario.startsWith("stress-")||scenario==="concurrent"?180_000:15_000;
const watchdog=setTimeout(()=>{stamp("WATCHDOG_TIMEOUT");process.exit(124)},watchdogMs);watchdog.unref();
process.once("beforeExit",()=>stamp("process beforeExit"));process.on("exit",code=>console.log(JSON.stringify({at:new Date().toISOString(),pid:process.pid,mode,scenario,stage:"process exit",code})));

async function transaction(client:PrismaClient,isolationLevel?:"RepeatableRead",advisory=false,forceRollback=false){stamp("before transaction");await client.$transaction(async tx=>{stamp("callback entered");if(advisory){stamp("before advisory");await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'stage-9h-b-repro'},0))`;stamp("after advisory")}stamp("before query 1");await tx.organization.count();stamp("after query 1");if(scenario==="many"||scenario==="repeatable"){stamp("before query 2");await tx.branch.count();stamp("after query 2");stamp("before query 3");await tx.financialTransaction.count();stamp("after query 3")}if(scenario==="rollback"||forceRollback){stamp("callback throwing");throw new Error("EXPECTED_ROLLBACK")}stamp("callback leaving")},{...(isolationLevel?{isolationLevel}:{}),maxWait:5_000,timeout:10_000});stamp("transaction resolved")}

async function main(){let client:PrismaClient=db,owned=false;if(mode==="fresh"){client=new PrismaClient({adapter:new PrismaPg({connectionString:getDatabaseUrl()})});owned=true}stamp("client ready");
 if(scenario==="read"){stamp("before ordinary read");await client.organization.count();stamp("after ordinary read")}
 else if(scenario==="one")await transaction(client);
 else if(scenario==="many")await transaction(client);
 else if(scenario==="repeatable")await transaction(client,"RepeatableRead");
 else if(scenario==="repeated")for(let i=0;i<5;i++){stamp(`repeat ${i} start`);await transaction(client);stamp(`repeat ${i} end`)}
 else if(scenario==="advisory")await transaction(client,undefined,true);
 else if(scenario==="rollback"){try{await transaction(client)}catch(error){if(!(error instanceof Error)||error.message!=="EXPECTED_ROLLBACK")throw error;stamp("rollback observed")}}
 else if(scenario==="stress-default")for(let i=0;i<100;i++){stamp(`stress default ${i} start`);await transaction(client)}
 else if(scenario==="stress-repeatable")for(let i=0;i<100;i++){stamp(`stress repeatable ${i} start`);await transaction(client,"RepeatableRead")}
 else if(scenario==="stress-advisory")for(let i=0;i<100;i++){stamp(`stress advisory ${i} start`);await transaction(client,undefined,true)}
 else if(scenario==="stress-rollback")for(let i=0;i<100;i++){stamp(`stress rollback ${i} start`);try{await transaction(client,undefined,false,true)}catch(error){if(!(error instanceof Error)||error.message!=="EXPECTED_ROLLBACK")throw error}}
 else if(scenario==="concurrent")await Promise.all(Array.from({length:10},async(_,i)=>{stamp(`concurrent ${i} start`);await transaction(client,"RepeatableRead")}));
 stamp("disconnect started");await client.$disconnect();stamp("disconnect resolved");if(!owned&&client!==db)throw new Error("invalid client lifecycle");clearTimeout(watchdog);stamp("completed");
}
main().catch(error=>{console.error(error);process.exitCode=1});
