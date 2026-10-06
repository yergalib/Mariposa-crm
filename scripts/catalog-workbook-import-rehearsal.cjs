// Fresh local databases only; UUIDs and catalogue names are transformed to synthetic values.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Client}=require('pg'),{compileManifest,executeIsolatedImport,sha,uuid}=require('./catalog-workbook-import.cjs');
assert.equal(process.argv[2],'--allow-isolated-workbook-rehearsal');
const root=path.resolve('../crm-price-audit'),connection=JSON.parse(fs.readFileSync(path.join(root,'isolated-policy-pg-connection.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(connection.host,'127.0.0.1');assert.ok(connection.port>10000&&connection.port!==5432);assert.equal(connection.user,'policy_test');assert.ok(path.resolve(connection.dataDirectory).startsWith(root+path.sep));
const config={host:connection.host,port:connection.port,user:connection.user,database:'postgres',connectionTimeoutMillis:3000};
const control=new Client(config),clients=[];const checks=[],timings={};let fixtureNumber=0;
const original=JSON.parse(fs.readFileSync(path.join(root,'full-workbook-dryrun-20261005.json'),'utf8'));
const Module=require('node:module'),ts=require('typescript');
const policyModule=new Module('rehearsal-policy.cjs');policyModule._compile(ts.transpileModule(fs.readFileSync('lib/catalog/operation-policy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,'rehearsal-policy.cjs');
const {resolveOperationPolicy}=policyModule.exports;
const mapping=new Map();const transform=value=>{
  if(typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value)){if(!mapping.has(value))mapping.set(value,uuid('SYNTHETIC:'+value));return mapping.get(value);}
  if(Array.isArray(value))return value.map(transform);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v)]));return value;
};
const manifest=transform(original);
for(const p of manifest.models){const renamed=p.before.name!==p.after.name;p.before.name='Synthetic '+p.product_id;p.after.name=renamed?'Synthetic corrected '+p.product_id:p.before.name;}
for(const g of manifest.groups){if(g.execution_id){const renamed=g.execution_before!==g.execution_after;g.execution_before='Synthetic '+g.execution_id;g.execution_after=renamed?'Synthetic corrected '+g.execution_id:g.execution_before;}}
const bytes=Buffer.from(JSON.stringify(manifest)),approvedAt='2026-10-05T12:00:00.000Z',plan=compileManifest(bytes,sha(bytes.toString()),approvedAt),org=manifest.organization_id;
const ddl=`
CREATE TYPE public."PublicationStatus" AS ENUM('DRAFT','ACTIVE','ARCHIVED');
CREATE TYPE public."InventoryTrackingMode" AS ENUM('BULK','SERIALIZED');
CREATE TYPE public."PriceType" AS ENUM('RENTAL','SALE');
CREATE TYPE public."StockAdjustmentType" AS ENUM('INITIAL','CORRECTION');
CREATE TYPE public."InventoryMovementType" AS ENUM('INITIAL','ADJUSTMENT');
CREATE TYPE public."AuditResult" AS ENUM('SUCCESS','DENIED','FAILURE');
CREATE TYPE public."AuditSource" AS ENUM('CRM','API','SYSTEM');
CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid NOT NULL,name text NOT NULL,is_rentable boolean NOT NULL,is_sellable boolean NOT NULL,show_on_website boolean NOT NULL,publication_status public."PublicationStatus" NOT NULL,archived_at timestamptz,tracking_mode public."InventoryTrackingMode" NOT NULL,direct_is_rentable_override boolean,direct_is_sellable_override boolean,direct_show_on_website_override boolean,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.product_executions(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES products(id),name text NOT NULL,is_active boolean NOT NULL,is_rentable_override boolean,is_sellable_override boolean,show_on_website_override boolean,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sizes(id uuid PRIMARY KEY,organization_id uuid NOT NULL,name text NOT NULL,code text NOT NULL,is_active boolean NOT NULL);
CREATE TABLE public.product_variants(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES products(id),execution_id uuid REFERENCES product_executions(id),size_id uuid NOT NULL REFERENCES sizes(id),sku text NOT NULL,is_active boolean NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,sku));
CREATE TABLE public.stock_levels(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_variant_id uuid NOT NULL REFERENCES product_variants(id),branch_id uuid NOT NULL,location_id uuid,quantity int NOT NULL CHECK(quantity>=0),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.stock_adjustments(id uuid PRIMARY KEY,organization_id uuid NOT NULL,stock_level_id uuid NOT NULL REFERENCES stock_levels(id),type public."StockAdjustmentType" NOT NULL,delta int NOT NULL,resulting_quantity int NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE public.inventory_movements(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_variant_id uuid NOT NULL REFERENCES product_variants(id),type public."InventoryMovementType" NOT NULL,quantity int NOT NULL,from_branch_id uuid,from_location_id uuid,source_type text NOT NULL,source_id uuid,idempotency_key text,reason text,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL,UNIQUE(organization_id,idempotency_key));
CREATE TABLE public.product_prices(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_variant_id uuid NOT NULL REFERENCES product_variants(id),branch_id uuid,type public."PriceType" NOT NULL,amount_minor bigint NOT NULL,currency char(3) NOT NULL,valid_from timestamptz NOT NULL,valid_until timestamptz,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE public.catalog_source_references(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES products(id),execution_id uuid REFERENCES product_executions(id),product_variant_id uuid NOT NULL REFERENCES product_variants(id),source_key text NOT NULL,preserved_payload jsonb NOT NULL);
CREATE TABLE public.orders(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL);
CREATE TABLE public.order_items(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_variant_id uuid NOT NULL REFERENCES product_variants(id),order_id uuid NOT NULL REFERENCES orders(id),historical_snapshot jsonb NOT NULL);
CREATE TABLE public.capacity_allocations(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_variant_id uuid NOT NULL REFERENCES product_variants(id),quantity int NOT NULL,returned_quantity int NOT NULL,status text NOT NULL);
CREATE TABLE public.sale_inventory_commitments(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_variant_id uuid NOT NULL REFERENCES product_variants(id),status text NOT NULL);
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY,organization_id uuid NOT NULL,action varchar(120) NOT NULL,entity_type varchar(80) NOT NULL,entity_id varchar(100),result public."AuditResult" NOT NULL,source public."AuditSource" NOT NULL,correlation_id varchar(100),metadata jsonb,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL);
`;
async function fixture(){
  const name='crm_manifest_rehearsal_'+(Date.now()+fixtureNumber++);assert.match(name,/^crm_manifest_rehearsal_\d+$/);await control.query('CREATE DATABASE "'+name+'"');
  const c=new Client({...config,database:name});await c.connect();clients.push(c);await c.query(ddl);
  for(const p of manifest.models){const b=p.before;await c.query('INSERT INTO products(id,organization_id,name,is_rentable,is_sellable,show_on_website,publication_status,archived_at,tracking_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'BULK\')',[p.product_id,org,b.name,b.is_rentable,b.is_sellable,b.show_on_website,b.publication_status,b.archived_at]);}
  for(const g of manifest.groups.filter(g=>g.execution_id))await c.query('INSERT INTO product_executions(id,organization_id,product_id,name,is_active)VALUES($1,$2,$3,$4,true)',[g.execution_id,org,g.product_id,g.execution_before]);
  const sizes=new Map();for(const v of manifest.variant_targets){sizes.set(v.size_id_before,v.size_before);sizes.set(v.size_id_after,v.size_after);}
  for(const [id,name] of sizes)await c.query('INSERT INTO sizes VALUES($1,$2,$3,$3,true)',[id,org,name]);
  for(const v of manifest.variant_targets){await c.query('INSERT INTO product_variants(id,organization_id,product_id,execution_id,size_id,sku,is_active)VALUES($1,$2,$3,$4,$5,$6,$7)',[v.variant_id,org,v.product_id,v.execution_id,v.size_id_before,v.sku_before,v.is_active_before]);
    for(const s of v.stock_rows_before)await c.query('INSERT INTO stock_levels(id,organization_id,product_variant_id,branch_id,location_id,quantity)VALUES($1,$2,$3,$4,$5,$6)',[s.id,org,v.variant_id,s.branch_id,s.location_id,s.quantity]);
    for(let i=0;i<v.source_ids_preserved.length;i++)await c.query('INSERT INTO catalog_source_references VALUES($1,$2,$3,$4,$5,$6,$7)',[v.source_ids_preserved[i],org,v.product_id,v.execution_id,v.variant_id,v.source_keys_preserved[i],{synthetic:true,openingQuantity:v.stock_before}]);
    assert.equal(v.movement_count_preserved,1);await c.query("INSERT INTO inventory_movements(id,organization_id,product_variant_id,type,quantity,source_type,occurred_at,created_at)VALUES($1,$2,$3,'INITIAL',$4,'SYNTHETIC_OPENING',$5,$5)",[uuid('opening:'+v.variant_id),org,v.variant_id,v.stock_before,'2026-09-01T00:00:00.000Z']);
  }
  // All eight excluded archive variants and sixteen prices stay in the same tenant.
  for(const v of manifest.excluded_archive_variants){
    await c.query("INSERT INTO products(id,organization_id,name,is_rentable,is_sellable,show_on_website,publication_status,archived_at,tracking_mode)VALUES($1,$2,$3,true,true,false,'ARCHIVED',$4,'SERIALIZED')ON CONFLICT(id)DO NOTHING",[v.product_id,org,'SYNTHETIC_ARCHIVE '+v.product_id,v.archived_at]);
    await c.query('INSERT INTO sizes VALUES($1,$2,$3,$3,true)ON CONFLICT(id)DO NOTHING',[v.size_id,org,v.size]);
    await c.query('INSERT INTO product_variants(id,organization_id,product_id,size_id,sku,is_active)VALUES($1,$2,$3,$4,$5,$6)',[v.id,org,v.product_id,v.size_id,v.sku,v.is_active]);
    for(const p of v.prices)await c.query('INSERT INTO product_prices(id,organization_id,product_variant_id,branch_id,type,amount_minor,currency,valid_from,valid_until,created_at,updated_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[p.id,org,v.id,p.branch_id,p.type,p.amount_minor,p.currency,p.valid_from,p.valid_until,p.created_at,p.updated_at]);
  }
  // Another tenant and an excluded serialized archive history are sentinels, never part of import.
  const otherOrg=uuid('other-org'),otherProduct=uuid('other-product'),otherVariant=uuid('other-variant'),size=uuid('other-size');
  await c.query("INSERT INTO sizes VALUES($1,$2,'OTHER_SIZE','OTHER_SIZE',true)",[size,otherOrg]);
  await c.query("INSERT INTO products(id,organization_id,name,is_rentable,is_sellable,show_on_website,publication_status,tracking_mode)VALUES($1,$2,'OUTSIDE_SENTINEL',true,true,false,'ARCHIVED','SERIALIZED')",[otherProduct,otherOrg]);
  await c.query("INSERT INTO product_variants(id,organization_id,product_id,size_id,sku,is_active)VALUES($1,$2,$3,$4,'OUTSIDE_SENTINEL',false)",[otherVariant,otherOrg,otherProduct,size]);
  await c.query('INSERT INTO orders VALUES($1,$2,\'COMPLETED\')',[uuid('outside-order'),otherOrg]);
  await c.query('INSERT INTO order_items VALUES($1,$2,$3,$4,$5)',[uuid('outside-item'),otherOrg,otherVariant,uuid('outside-order'),{signed:false,depositSeparate:true,history:'unchanged'}]);
  return c;
}
async function fingerprint(c){const tables=['products','product_executions','sizes','product_variants','stock_levels','stock_adjustments','inventory_movements','product_prices','catalog_source_references','orders','order_items','capacity_allocations','sale_inventory_commitments','audit_logs'];const rows={};for(const t of tables)rows[t]=(await c.query('SELECT * FROM public.'+t+' ORDER BY id')).rows;return sha(rows);}
async function excludedFingerprint(c){const ids=manifest.excluded_archive_variants.map(v=>v.id);return sha({variants:(await c.query('SELECT * FROM product_variants WHERE id=ANY($1::uuid[])ORDER BY id',[ids])).rows,prices:(await c.query('SELECT * FROM product_prices WHERE product_variant_id=ANY($1::uuid[])ORDER BY id',[ids])).rows,products:(await c.query('SELECT * FROM products WHERE id=ANY($1::uuid[])ORDER BY id',[[...new Set(manifest.excluded_archive_variants.map(v=>v.product_id))]])).rows});}
async function test(name,fn){const start=Date.now();await fn();checks.push({name,status:'PASS',milliseconds:Date.now()-start});console.log('PASS '+name);}
async function main(){
  await control.connect();const identity=(await control.query("SELECT current_setting('data_directory') directory,inet_server_port() port,current_user username")).rows[0];assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(connection.dataDirectory).toLowerCase());assert.equal(identity.port,connection.port);assert.equal(identity.username,'policy_test');
  await test('manifest byte SHA and complete owner-confirmed dimensions reject tampering',async()=>{assert.throws(()=>compileManifest(bytes,'0'.repeat(64),approvedAt));const altered=JSON.parse(bytes);altered.merge_pairs[0].after_pair_units=21;const b=Buffer.from(JSON.stringify(altered));assert.throws(()=>compileManifest(b,sha(b.toString()),approvedAt));});
  const start=Date.now(),c=await fixture();timings.freshSyntheticFixtureMs=Date.now()-start;const options={isolatedDirectory:connection.dataDirectory},excludedBefore=await excludedFingerprint(c);
  await test('failure after hundreds of writes rolls back model flags, stock, prices, audit and history together',async()=>{const before=await fingerprint(c);await assert.rejects(executeIsolatedImport(c,plan,{...options,failAfterWrites:700}),/INJECTED/);assert.equal(await fingerprint(c),before);});
  await test('complete 444/1052 rehearsal commits exactly 4826 units, 994 active variants and 1184 prices',async()=>{const outsideBefore=(await c.query("SELECT * FROM products WHERE name='OUTSIDE_SENTINEL'")).rows;const started=Date.now(),result=await executeIsolatedImport(c,plan,options);timings.atomicApplyMs=Date.now()-started;sameResult=result;assert.deepEqual(result.totals,{units:4826,activeVariants:994,prices:1184});assert.deepEqual((await c.query("SELECT * FROM products WHERE name='OUTSIDE_SENTINEL'")).rows,outsideBefore);for(const pair of manifest.merge_pairs){const n=(await c.query('SELECT sum(quantity)::int n FROM stock_levels WHERE product_variant_id=$1',[pair.canonical_variant_id])).rows[0].n;assert.equal(n,pair.after_pair_units);}
    const originalMovements=(await c.query("SELECT count(*)::int n FROM inventory_movements WHERE type='INITIAL'")).rows[0].n;assert.equal(originalMovements,1052);assert.equal((await c.query('SELECT count(*)::int n FROM catalog_source_references')).rows[0].n,1063);
    assert.equal(await excludedFingerprint(c),excludedBefore);
    assert.equal((await c.query('SELECT count(*)::int n FROM product_prices WHERE product_variant_id=ANY($1::uuid[])',[manifest.excluded_archive_variants.map(v=>v.id)])).rows[0].n,16);
    for(const p of manifest.price_deltas){const row=(await c.query('SELECT * FROM product_prices WHERE id=$1',[p.deterministic_id])).rows[0];assert.equal(row.type,p.type);assert.equal(row.amount_minor,p.amount_minor);assert.equal(row.product_variant_id,p.variant_id);assert.equal(row.branch_id,null);assert.equal(row.valid_from.toISOString(),approvedAt);}
    const products=(await c.query('SELECT * FROM products')).rows,executions=(await c.query('SELECT * FROM product_executions')).rows,variants=(await c.query('SELECT * FROM product_variants')).rows;
    const published=[];
    for(const g of manifest.groups){const p=products.find(p=>p.id===g.product_id),e=executions.find(e=>e.id===g.execution_id);const policy=resolveOperationPolicy({id:p.id,organizationId:p.organization_id,isRentable:p.is_rentable,isSellable:p.is_sellable,showOnWebsite:p.show_on_website,directIsRentableOverride:p.direct_is_rentable_override,directIsSellableOverride:p.direct_is_sellable_override,directShowOnWebsiteOverride:p.direct_show_on_website_override},g.execution_id,e?{id:e.id,organizationId:e.organization_id,productId:e.product_id,isActive:e.is_active,isRentableOverride:e.is_rentable_override,isSellableOverride:e.is_sellable_override,showOnWebsiteOverride:e.show_on_website_override}:null);if(policy.showOnWebsite&&(policy.isRentable||policy.isSellable)&&variants.some(v=>g.variant_ids.includes(v.id)&&v.is_active))published.push({key:g.key,...policy});}
    assert.equal(published.length,298);assert.equal(published.filter(p=>p.isSellable&&!p.isRentable).length,148);assert.equal(published.filter(p=>p.isRentable).length,150);const pages=Array.from({length:25},(_,i)=>published.slice(i*12,i*12+12));assert.equal(new Set(pages.flat().map(p=>p.key)).size,298);
  });
  await test('exact replay appends nothing and detects changed after-state',async()=>{const before=await fingerprint(c);assert.equal((await executeIsolatedImport(c,plan,options)).replayed,true);assert.equal(await fingerprint(c),before);await c.query('UPDATE product_prices SET amount_minor=amount_minor+1 WHERE id=$1',[manifest.price_deltas[0].deterministic_id]);await assert.rejects(executeIsolatedImport(c,plan,options),/replay after-state/);});
  await test('stock drift and a new active commitment fail before any import write',async()=>{const d=await fixture();await d.query('UPDATE stock_levels SET quantity=quantity+1 WHERE id=$1',[manifest.variant_targets[0].stock_rows_before[0].id]);const before=await fingerprint(d);await assert.rejects(executeIsolatedImport(d,plan,options),/stock row distribution/);assert.equal(await fingerprint(d),before);const e=await fixture();await e.query("INSERT INTO sale_inventory_commitments VALUES($1,$2,$3,'ACTIVE')",[uuid('new-commitment'),org,manifest.variant_targets[0].variant_id]);const old=await fingerprint(e);await assert.rejects(executeIsolatedImport(e,plan,options),/sale commitment/);assert.equal(await fingerprint(e),old);});
  await test('wrong database identity is rejected before BEGIN or any write',async()=>{let sql=[];const fake={query:async q=>{sql.push(q);return {rows:[{db:'postgres',host:'127.0.0.1',directory:connection.dataDirectory}]};}};await assert.rejects(executeIsolatedImport(fake,plan,options));assert.equal(sql.length,1);});
  await test('catalogue and capacity locks block a concurrent foreign-key price insert until import commit',async()=>{
    const d=await fixture(),database=(await d.query('SELECT current_database() name')).rows[0].name,w=new Client({...config,database});await w.connect();clients.push(w);
    let locked,release;const ready=new Promise(r=>locked=r),hold=new Promise(r=>release=r);
    const importing=executeIsolatedImport(d,plan,{...options,beforeWrites:async()=>{locked();await hold;}});await ready;
    await w.query("SET statement_timeout='5s'");let inserted=false;
    const pending=w.query('INSERT INTO product_prices(id,organization_id,product_variant_id,type,amount_minor,currency,valid_from,created_at,updated_at)VALUES($1,$2,$3,\'SALE\',1,\'KZT\',$4,$4,$4)',[uuid('concurrent-price'),org,manifest.variant_targets[0].variant_id,approvedAt]).then(()=>inserted=true);
    const deadline=Date.now()+3000;let observed=false;
    while(Date.now()<deadline){const state=(await control.query('SELECT pg_blocking_pids($1) blockers',[w.processID])).rows[0];if(state.blockers.length){observed=true;break;}await new Promise(r=>setTimeout(r,20));}
    assert.equal(observed,true);assert.equal(inserted,false);release();assert.equal((await importing).replayed,false);await pending;assert.equal(inserted,true);
  });
  const report={status:'PASS_SYNTHETIC_FULL_WORKBOOK_REHEARSAL',checks,timings,totals:sameResult.totals,manifestDimensions:[444,1052,330],syntheticRemappedIds:true,customerDataImported:false,externalCalls:0,productionWrites:0,liveBackupOrRestore:false,limitations:'Minimal local schema with relevant enums/FK/unique keys; not a full Production restored-copy rehearsal or all live triggers. Live apply is deliberately rejected by the executor.'};fs.writeFileSync(path.join(root,'catalog-workbook-import-rehearsal-20261005.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
let sameResult;
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await Promise.allSettled(clients.map(c=>c.end()));await control.end();});
