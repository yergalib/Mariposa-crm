// Local verification only: allowlisted environment, no real DB/key/env files.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/evidence/owner-main-day-20261021');
for(const name of ['.env','.env.local','.env.production','.env.production.local'])if(fs.existsSync(path.join(root,name)))throw Error('Unexpected environment file: '+name);
fs.mkdirSync(out,{recursive:true});
const env={NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'postgresql://synthetic@127.0.0.1:62399/owner_day_offline'};
for(const key of ['SystemRoot','WINDIR','TEMP','TMP','PATH'])if(process.env[key])env[key]=process.env[key];
const files=['lib/assistant/owner-day-config.ts','lib/assistant/owner-day-access.ts','lib/assistant/chat/owner-test.ts','lib/assistant/chat/owner-test-request.ts','lib/assistant/chat/provider-budget.ts','lib/assistant/history/access.ts','lib/assistant/history/service.ts','lib/showroom/service.ts','lib/showroom/http.ts','app/api/showroom/assistant/route.ts','app/api/showroom/assistant/smoke/route.ts','app/api/showroom/history/route.ts','app/api/showroom/photo/route.ts','app/showroom/page.tsx','app/showroom/ChatSelectionEntry.tsx'];
const checks=[['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['lint',['node_modules/eslint/bin/eslint.js',...files]],['build',['node_modules/next/dist/bin/next','build','--webpack']]];
const statuses={};
for(const [name,args] of checks){const fd=fs.openSync(path.join(out,name+'.log'),'w');const r=cp.spawnSync(process.execPath,args,{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:true});fs.closeSync(fd);statuses[name]=r.status;console.log(name+': '+r.status);if(r.status!==0){fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(statuses,null,2));process.exit(r.status??1)}}
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({...statuses,realModelCalls:0,liveDatabaseUsed:false},null,2));
