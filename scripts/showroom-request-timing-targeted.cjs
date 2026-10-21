const fs=require('fs'),Module=require('module'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('path');
const p=path.resolve('lib/showroom/request-timing.ts');const m=new Module(p,module);m.filename=p;m.paths=module.paths;let enabled=true;m.require=id=>id==='server-only'?{}:id==='@/lib/assistant/owner-day-config'?{ownerMainRestricted:()=>enabled}:require(id);m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {withRequestTiming,timed,allowRequestTiming,photoOutcome}=m.exports;
(async()=>{
const [yes,no]=await Promise.all([withRequestTiming(async()=>{allowRequestTiming();await timed('catalog',async()=>{await new Promise(r=>setTimeout(r,10))});photoOutcome('storage_error');return new Response('ok')}),withRequestTiming(async()=>{await timed('session',async()=>{});return new Response('denied',{status:403})})]);
assert.match(yes.headers.get('server-timing'),/^catalog;dur=[\d.]+;desc="1", total;dur=[\d.]+$/);assert.equal(yes.headers.get('x-mariposa-photo-outcome'),'storage_error');assert.equal(no.headers.get('server-timing'),null);assert.equal(no.headers.get('x-mariposa-photo-outcome'),null);
enabled=false;const off=await withRequestTiming(async()=>{allowRequestTiming();return new Response('ok')});assert.equal(off.headers.get('server-timing'),null);
await assert.rejects(()=>timed('storage',async()=>{throw Error('private') }),/private/);
console.log('PASS request isolation, denied response no diagnostics, mode off, bounded numeric timing, unchanged errors; no network');
})().catch(e=>{console.error(e);process.exitCode=1});
