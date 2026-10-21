// Local verification only: allowlisted environment, no real DB/key/env files.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/evidence/owner-main-day-20261021');
for(const name of ['.env','.env.local','.env.production','.env.production.local'])if(fs.existsSync(path.join(root,name)))throw Error('Unexpected environment file: '+name);
fs.mkdirSync(out,{recursive:true});
const env={NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'postgresql://postgres:synthetic@db.jawposhuxaexoqzopgoq.supabase.co:5432/postgres?sslmode=require',
 VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_FSsQxUktUBH9VNCGeadBoNnzlD1W',VERCEL_GIT_COMMIT_REF:'review/ai-header-preview-candidate-20261011',
 MARIPOSA_OWNER_DAY_TEST:'main-2026-10-21',STOREFRONT_ORGANIZATION_ID:'2157bde1-1994-465b-9f80-e1b740ee3cb1',
 MARIPOSA_ASSISTANT_ORGANIZATION_ID:'2157bde1-1994-465b-9f80-e1b740ee3cb1',MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID:'c580c434-53c7-4f37-a388-da443c4e426e',
 MARIPOSA_ASSISTANT_ENABLED:'1',MARIPOSA_ASSISTANT_PRICE_ACK:'gpt-6-luna:2026-10-20:standard:0.10:0.01:0.125:0.50',
 NODE_OPTIONS:'--require "'+path.join(root,'scripts/owner-day-offline-network.cjs').replaceAll('\\','/')+'"'};
for(const key of ['SystemRoot','WINDIR','TEMP','TMP','PATH'])if(process.env[key])env[key]=process.env[key];
const files=['lib/assistant/owner-day-config.ts','lib/assistant/owner-day-access.ts','lib/assistant/chat/owner-test.ts','lib/assistant/chat/owner-test-request.ts','lib/assistant/chat/provider-budget.ts','lib/assistant/history/access.ts','lib/assistant/history/service.ts','lib/showroom/service.ts','lib/showroom/http.ts','app/api/showroom/assistant/route.ts','app/api/showroom/assistant/smoke/route.ts','app/api/showroom/history/route.ts','app/api/showroom/photo/route.ts','app/showroom/page.tsx','app/showroom/ChatSelectionEntry.tsx'];
const checks=[['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['lint',['node_modules/eslint/bin/eslint.js',...files]],['build',['node_modules/next/dist/bin/next','build','--webpack']]];
checks[1][1].push('lib/env.ts','lib/assistant/owner-day-resources.ts','lib/showroom/inquiry-access.ts','app/api/showroom/inquiries/route.ts','app/showroom/InquiryAccess.tsx','app/showroom/InquiryForm.tsx','app/showroom/ShowroomProductDetail.tsx','app/showroom/Fitting.tsx');
const statuses={};
for(const [name,args] of checks){const fd=fs.openSync(path.join(out,name+'.log'),'w');const r=cp.spawnSync(process.execPath,args,{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:true});fs.closeSync(fd);statuses[name]=r.status;console.log(name+': '+r.status);if(r.status!==0){fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(statuses,null,2));process.exit(r.status??1)}}
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({...statuses,realModelCalls:0,liveDatabaseUsed:false,environmentProfile:'approved-owner-day-vercel-preview',tcpTlsFetchBlocked:true},null,2));
