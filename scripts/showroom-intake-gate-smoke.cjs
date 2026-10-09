// Direct service gate, without even reading the caller's contact payload.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;let dbReads=0;
Module._resolveFilename=function(n,...a){return resolve.call(this,n.startsWith('@/')?path.resolve(n.slice(2)):n,...a)};
Module._load=function(n,...a){if(n==='server-only')return{};if(n==='@/lib/db')return{db:new Proxy({},{get(){dbReads++;throw Error('Unexpected DB');}})};if(n==='@/lib/audit/log')return{};if(n==='@/lib/availability/capacity')return{};return load.call(this,n,...a)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
(async()=>{const{submitPublicInquiry}=require('../lib/showroom/service.ts');await assert.rejects(submitPublicInquiry(new Proxy({},{get(){throw Error('Unexpected contact read')}})),e=>e.status===503);assert.equal(dbReads,0);console.log('PASS: direct public inquiry service rejects while release closed before payload parsing, tenant lookup, DB or audit.');})().catch(e=>{console.error(e);process.exitCode=1});
