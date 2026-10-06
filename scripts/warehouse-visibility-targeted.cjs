// Read-only existing synthetic full-schema fixture. No env files or live DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),{spawn,spawnSync}=require('node:child_process');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'..'),runtime=path.join(root,'import-test-runtime'),out=path.join(root,'warehouse-visibility-evidence');fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(runtime,'result.json')));assert.equal(fixture.syntheticOnly,true);assert.match(fixture.database,/^crm_main_boundary_\d+$/);
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');require('tsx/cjs');
const {PrismaClient}=require('../generated/prisma/client.ts'),{PrismaPg}=require('@prisma/adapter-pg'),{Client}=require('pg');
const pgctl='C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe',data=path.join(runtime,'pgdata');
const config={host:'127.0.0.1',port:62317,user:'import_test',database:fixture.database,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:3000};
let db,c,server,chrome,ws,started=false,seq=0,session,deny=false;const pending=new Map(),checks=[],errors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<100;i++){try{const r=await fn();if(r)return r;}catch{}await delay(100);}throw Error('wait timeout');}
async function test(name,fn){await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error(method+' timeout'));},10000).unref();});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function click(selector){const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView();const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});}
const cache=new Map();let summary;
function load(file){if(cache.has(file))return cache.get(file);const mod={exports:{}};
const req=n=>{
 if(n==='server-only')return{};if(n==='@/lib/db')return{db};if(n==='react'||n==='react/jsx-runtime')return require(n);
 if(n==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(n==='@/components/AppShell')return{AppShell:({children,title})=>React.createElement('main',{},React.createElement('h1',{},title),children)};
 if(n==='@/components/OperationalItemSelector')return{OperationalItemSelector:()=>null};
 if(n==='@/lib/auth/session')return{requireRouteAccess:async()=>session};
 if(n==='@/lib/permissions/effective')return{requirePermission:async()=>{if(deny)throw Error('DENIED');},hasPermission:async()=>true};
 if(n==='@/lib/inventory/movements')return{getWarehouseSummary:summary};
 if(n==='@/lib/inventory/scan')return{resolveInventoryScan:async()=>null};
 if(n==='@/lib/inventory/bulk-operations')return{getBulkVariantOperationalState:()=>{throw Error('unexpected scan');}};
 if(n.startsWith('@/'))return load(n.slice(2)+'.ts');throw Error('Unexpected import '+n);
};
const code=ts.transpileModule(fs.readFileSync(path.join(app,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{console,URLSearchParams,Date})(req,mod,mod.exports);cache.set(file,mod.exports);return mod.exports;}
(async()=>{try{
assert.equal(fs.existsSync(path.join(data,'postmaster.pid')),false,'Dedicated fixture cluster must initially be stopped');
const start=spawnSync(pgctl,['-D',data,'-l',path.join(out,'postgres.log'),'-o','-h 127.0.0.1 -p 62317','-w','start'],{windowsHide:true,encoding:'utf8',timeout:30000});assert.equal(start.status,0,start.stderr);started=true;
c=new Client(config);await c.connect();const identity=(await c.query("SELECT current_setting('data_directory') dir,current_setting('default_transaction_read_only') ro")).rows[0];assert.equal(path.resolve(identity.dir).toLowerCase(),data.toLowerCase());assert.equal(identity.ro,'on');
const org=(await c.query('SELECT organization_id,count(*) n FROM stock_levels GROUP BY organization_id ORDER BY n DESC LIMIT 1')).rows[0].organization_id;assert.notEqual(org,'2157bde1-1994-465b-9f80-e1b740ee3cb1');
db=new PrismaClient({adapter:new PrismaPg(config)});summary=load('lib/inventory/warehouse-summary.ts').getWarehouseSummary;const tenant={organizationId:org};
const reference=(await c.query("SELECT s.id,s.branch_id,s.quantity,v.sku,p.name,s.updated_at FROM stock_levels s JOIN product_variants v ON v.id=s.product_variant_id JOIN products p ON p.id=v.product_id WHERE s.organization_id=$1 AND p.tracking_mode='BULK' ORDER BY v.sku,s.id",[org])).rows;
assert.ok(reference.length>200);assert.ok(new Set(reference.map(r=>String(r.updated_at))).size<reference.length,'Fixture has tied timestamps');
await test('all pages cover every BULK row once despite equal timestamps; exact totals',async()=>{
const ids=[];let pages=1;for(let page=1;page<=pages;page++){const r=await summary(tenant,null,{stock:'all',page:String(page)});pages=r.pages;assert.equal(r.total,reference.length);assert.equal(r.units,reference.reduce((n,x)=>n+x.quantity,0));assert.equal(r.first,(page-1)*100+1);ids.push(...r.bulk.map(x=>x.id));}assert.deepEqual(ids,reference.map(x=>x.id));assert.equal(new Set(ids).size,reference.length);
});
await test('default positive and explicit zero/all filters preserve all rows and clamp pages',async()=>{
const positive=await summary(tenant,null),zero=await summary(tenant,null,{stock:'zero',page:'9999999'});assert.equal(positive.total,reference.filter(r=>r.quantity>0).length);assert.ok(positive.bulk.every(r=>r.quantity>0));assert.equal(zero.total,reference.filter(r=>r.quantity===0).length);assert.equal(zero.page,zero.pages);assert.equal(zero.total+positive.total,reference.length);assert.equal((await summary(tenant,null,{page:'-3'})).page,1);
});
await test('partial case-insensitive SKU/name search across full set, not first100',async()=>{
for(const search of [reference[reference.length-1].sku.toLowerCase(),reference[reference.length-1].name.toLowerCase()]){const r=await summary(tenant,null,{stock:'all',search:' '+search+' '});const expected=reference.filter(x=>x.sku.toLowerCase().includes(search)||x.name.toLowerCase().includes(search));assert.equal(r.total,expected.length);assert.deepEqual(r.bulk.map(x=>x.id),expected.slice(0,100).map(x=>x.id));}
assert.equal((await summary(tenant,null,{search:'NO-SUCH-SYNTHETIC-ITEM'})).total,0);
});
await test('tenant and branch scoping including empty grants never widen counts or rows',async()=>{
assert.equal((await summary(tenant,[],{stock:'all'})).total,0);assert.equal((await summary({organizationId:'00000000-0000-4000-8000-000000000000'},null,{stock:'all'})).total,0);const branch=reference[0].branch_id;const r=await summary(tenant,[branch],{stock:'all'});assert.equal(r.total,reference.filter(x=>x.branch_id===branch).length);assert.ok(r.bulk.every(x=>x.branchId===branch));
});
session={organizationId:org,hasOrganizationWideBranchAccess:true,allowedBranchIds:[],role:'OWNER'};const view=load('components/InventoryView.tsx').InventoryView;
await test('warehouse view still enforces INVENTORY_VIEW before reads',async()=>{deny=true;try{await assert.rejects(view({searchParams:Promise.resolve({})}),/DENIED/);}finally{deny=false;}});
const css=fs.readdirSync(path.join(app,'app')).filter(x=>x.endsWith('.css')).map(x=>fs.readFileSync(path.join(app,'app',x),'utf8')).join('\n');
server=http.createServer(async(req,res)=>{try{const params=Object.fromEntries(new URL(req.url,'http://127.0.0.1').searchParams);const html=renderToStaticMarkup(await view({searchParams:Promise.resolve(params)}));res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+html);}catch(e){res.statusCode=500;res.end('fixture error');errors.push(String(e));}});await new Promise(r=>server.listen(62336,'127.0.0.1',r));
chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-background-networking','--disable-sync','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port=62337','--user-data-dir='+path.join(out,'chrome-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const target=await until(async()=>{const r=await fetch('http://127.0.0.1:62337/json/new?about:blank',{method:'PUT'});return r.ok?r.json():null;});ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}};await send('Page.enable');await send('Runtime.enable');
await test('local warehouse UI navigates pages and GET search resets to first page',async()=>{
await send('Page.navigate',{url:'http://127.0.0.1:62336/warehouse?bulkStock=all&status=AVAILABLE'});await until(()=>evaluate('document.body.textContent.includes("Страница 1")'));
await click('nav[aria-label="Страницы BULK остатков"] a:last-child');await until(()=>evaluate('location.search.includes("bulkPage=2")&&document.body.textContent.includes("Страница 2")'));assert.ok((await evaluate('location.search')).includes('status=AVAILABLE'));
await evaluate(`document.querySelector('[name=q]').value=${JSON.stringify(reference.at(-1).sku)};document.querySelector('form.inventory-toolbar').requestSubmit()`);await until(()=>evaluate('location.search.includes("q=")&&!location.search.includes("bulkPage")'));await until(()=>evaluate('document.body.textContent.includes("Страница 1 из 1")'));assert.ok((await evaluate('document.body.textContent')).includes(reference.at(-1).sku));
const exportHref=await evaluate('document.querySelector("a[href*=export]").getAttribute("href")');assert.ok(!exportHref.includes('bulkStock'));assert.ok(exportHref.includes('q='));
const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'warehouse-search.png'),Buffer.from(screenshot.data,'base64'));
});
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PASS',checks,rows:reference.length,errors,limitations:['Isolated read-only synthetic PostgreSQL; actual query and InventoryView','Auth/AppShell/scan component replaced in local UI fixture; no Production calls','Stable pagination on unchanged data; concurrent inserts/deletes between page requests can shift offset pages']},null,2));
}catch(e){console.error(e);process.exitCode=1;fs.writeFileSync(path.join(out,'failure.txt'),String(e));}finally{if(ws){try{await send('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();if(server)server.close();if(db)await db.$disconnect();if(c)await c.end();if(started)spawnSync(pgctl,['-D',data,'-m','fast','-w','stop'],{windowsHide:true,timeout:30000});}})();
