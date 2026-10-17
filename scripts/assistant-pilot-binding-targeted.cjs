const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/assistant/pilot-test-config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m.exports,module:m,URL,Set,process:{env:{}}});
const c=m.exports,p=c.PILOT_TEST,env={MARIPOSA_PILOT_HISTORY_TEST:'1',MARIPOSA_PILOT_TEST_RUN_ID:p.runId,VERCEL_ENV:'preview',VERCEL_PROJECT_ID:p.project,VERCEL_GIT_COMMIT_REF:p.ref,STOREFRONT_ORGANIZATION_ID:p.organizationId,MARIPOSA_ASSISTANT_ENABLED:'0'};
const good=`postgresql://postgres:synthetic-password@db.${p.resource}.supabase.co:5432/postgres?sslmode=require`;
c.assertPilotDatabaseUrl(good,env);
c.assertPilotDatabaseUrl(good.replace('?sslmode=require',''),env);
c.assertPilotDatabaseUrl(good.replace(`postgres:synthetic-password@db.${p.resource}.supabase.co`,`postgres.${p.resource}:synthetic-password@aws-0-ap-south-1.pooler.supabase.com`).replace('?sslmode=require',''),env);
for(const [url,code] of [[good.replace(p.resource,'foreign-project'),'PROJECT_ENDPOINT'],[good.replace('sslmode=require','sslmode=disable'),'TLS_MODE'],[good+'&host=foreign.invalid','UNSUPPORTED_PARAMETER'],[good+'&sslmode=disable','TLS_PARAMETER_COUNT'],[good.replace(':5432',':6543'),'PORT'],[good.replace('/postgres?','/other?'),'DATABASE_NAME']]) {
 assert.throws(()=>c.assertPilotDatabaseUrl(url,env),e=>e.message.includes(code)&&!e.message.includes('synthetic-password')&&!e.message.includes(p.resource)&&!e.message.includes('foreign.invalid'));
}
assert.throws(()=>c.assertPilotDatabaseUrl(good,{...env,VERCEL_ENV:'production'}),/PREVIEW_CONFIGURATION/);
console.log('PASS: direct/session-pool bindings preserve absent sslmode; 7 invalid cases fail closed with value-free diagnostic codes');
