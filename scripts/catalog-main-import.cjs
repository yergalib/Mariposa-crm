// Explicit future Main entrypoint. Default is OFFLINE; never loads .env or app/lib/db.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {compileManifest,executeWorkbookTransaction,sha,uuid}=require('./catalog-workbook-transaction.cjs');
const PROJECT='prj_FSsQxUktUBH9VNCGeadBoNnzlD1W',TENANT='2157bde1-1994-465b-9f80-e1b740ee3cb1';
const MANIFEST='bef8eaf3e75db27fd166852951eb646d228b6b3f21e37f9e6052a5bfa20be821';
const RELEASE='4aef8c35faa9c0e6de77f268b6bce232ccd562a4';
const HOST='db.jawposhuxaexoqzopgoq.supabase.co';
const ACK='APPLY_FULL_MAIN_MANIFEST_AFTER_VERIFIED_BARRIER_AND_BACKUP';
const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
const codeSha=()=>hashBytes(Buffer.concat(['catalog-main-import.cjs','catalog-workbook-transaction.cjs'].map(f=>fs.readFileSync(path.join(__dirname,f)))));
const utc=value=>{assert.equal(typeof value,'string');assert.equal(new Date(value).toISOString(),value,'Exact UTC timestamp required');return Date.parse(value);};
function exact(obj,keys,label){assert.ok(obj&&typeof obj==='object'&&!Array.isArray(obj),label);assert.deepEqual(Object.keys(obj).sort(),keys.sort(),`Unknown/missing ${label} fields`);}
function offline(manifestPath,at){const plan=compileManifest(fs.readFileSync(manifestPath),MANIFEST,at);assert.equal(plan.manifest.organization_id,TENANT,'Main tenant mismatch');return plan;}
function validateRequest(r,plan){
  exact(r,['version','projectId','tenantId','manifestSha','releaseSha','codeSha','schemaSha','applicationTimestamp','database','authorization','backup','barrier'],'request');
  assert.equal(r.version,1);assert.equal(r.projectId,PROJECT);assert.equal(r.tenantId,TENANT);
  assert.equal(r.manifestSha,MANIFEST);assert.equal(r.releaseSha,RELEASE);assert.equal(r.codeSha,codeSha(),'Runner changed since review');
  assert.match(r.schemaSha,/^[a-f0-9]{64}$/);assert.equal(r.applicationTimestamp,plan.approvedAt);
  exact(r.database,['host','port','name','user'],'database');
  assert.deepEqual(r.database,{host:HOST,port:5432,name:'postgres',user:'postgres'},'Only reviewed direct Main endpoint is supported');
}
function verifyFile(e){assert.match(e.sha256,/^[a-f0-9]{64}$/);assert.equal(typeof e.path,'string');assert.ok(path.isAbsolute(e.path));assert.ok(fs.statSync(e.path).size>0);assert.equal(hashBytes(fs.readFileSync(e.path)),e.sha256,'Evidence bytes changed');}
function verifyApplyGate(r,confirmation,now=Date.now()){
  assert.equal(confirmation,ACK,'Explicit apply confirmation missing');
  exact(r.authorization,['scope','approvedBy','approvedAt','expiresAt'],'authorization');
  assert.equal(r.authorization.scope,ACK);assert.ok(typeof r.authorization.approvedBy==='string'&&r.authorization.approvedBy.trim().length>=3);
  const authorized=utc(r.authorization.approvedAt),expires=utc(r.authorization.expiresAt);
  assert.ok(authorized<=now&&now<expires&&expires-authorized<=2*3600000,'Approval window invalid/expired');
  assert.ok(authorized<=utc(r.applicationTimestamp)&&utc(r.applicationTimestamp)<=now,'Application timestamp must belong to the approved window and not be in the future');
  exact(r.barrier,['path','sha256','verifiedAt','drainedAt'],'barrier');
  exact(r.backup,['path','sha256','snapshotAt','restoreVerifiedAt'],'backup');
  const barrier=utc(r.barrier.verifiedAt),drain=utc(r.barrier.drainedAt),backup=utc(r.backup.snapshotAt),restore=utc(r.backup.restoreVerifiedAt);
  assert.ok(authorized<=barrier&&barrier<=drain&&drain<=backup&&backup<=restore&&restore<=now,'Require approved barrier, drain, then fresh verified backup');
  assert.ok(now-backup<=3600000,'Backup older than one hour; STOP and review');
  verifyFile(r.barrier);verifyFile(r.backup);
  // Evidence is an operator attestation, not an automatically established WAF/drain proof.
  // A matching file or --confirm must NEVER be substituted for actual owner authorization.
}
function connectionConfig(r,value){
  assert.ok(value,'Set MARIPOSA_IMPORT_DATABASE_URL only in the approved execution environment');
  const u=new URL(value);assert.ok(['postgres:','postgresql:'].includes(u.protocol));
  assert.equal(u.hostname,r.database.host);assert.equal(Number(u.port||5432),r.database.port);
  assert.equal(decodeURIComponent(u.pathname.slice(1)),r.database.name);assert.equal(decodeURIComponent(u.username),r.database.user);
  assert.equal(u.search,'','URL parameters are forbidden');assert.equal(u.hash,'');assert.ok(u.password);
  return {host:r.database.host,port:r.database.port,database:r.database.name,user:r.database.user,password:decodeURIComponent(u.password),
    ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000,query_timeout:35000,application_name:'mariposa-reviewed-full-main-import'};
}
async function verifyIdentity(client){
  const row=(await client.query("SELECT current_database() db,current_user AS username,current_setting('session_replication_role') replication,pg_is_in_recovery() recovery")).rows[0];
  assert.equal(row.db,'postgres');assert.equal(row.username,'postgres');assert.equal(row.replication,'origin');assert.equal(row.recovery,false);
  assert.equal((await client.query('SELECT id FROM public.organizations WHERE id=$1',[TENANT])).rows.length,1,'Main tenant absent');
}
const schemaQueries=[
  "SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  "SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
  "SELECT p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY p.proname,args",
  "SELECT c.relname,x.conname,x.convalidated,pg_get_constraintdef(x.oid) definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,x.conname",
  "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
  "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname",
  "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
  "SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"
];
async function schemaFingerprint(client){const rows=[];for(const sql of schemaQueries)rows.push((await client.query(sql)).rows);return sha(rows);}
function preservedScopes(plan){
  const m=plan.manifest,ids=m.variant_targets.map(v=>v.variant_id),org=m.organization_id;
  const scopes={products:['id',m.models.map(p=>p.product_id)],product_executions:['id',m.groups.flatMap(g=>g.execution_id?[g.execution_id]:[])],
    product_variants:['id',ids],stock_levels:['product_variant_id',ids],product_prices:['product_variant_id',ids]};
  const corrections=m.variant_targets.filter(v=>v.stock_delta<0).flatMap(v=>v.stock_rows_before.filter(s=>s.quantity>0));
  const append={inventory_movements:corrections.map(s=>uuid(`${plan.manifestSha}:movement:${s.id}`)),stock_adjustments:corrections.map(s=>uuid(`${plan.manifestSha}:adjustment:${s.id}`)),
    audit_logs:[plan.markerId,...corrections.map(s=>uuid(`${plan.manifestSha}:audit:${s.id}`))]};
  return {org,scopes,append};
}
async function preservationFingerprint(client,plan){
  const {org,scopes,append}=preservedScopes(plan),result=[];
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  assert.ok(tables.length>=61,'Incomplete public schema');
  for(const {tablename:table} of tables){
    assert.match(table,/^[a-z_][a-z0-9_]*$/);
    const scope=scopes[table],extra=append[table];let where='TRUE',args=[],projection='to_jsonb(t)';
    const mutable={products:['name','is_rentable','is_sellable','show_on_website','publication_status','archived_at','direct_is_rentable_override','direct_is_sellable_override','direct_show_on_website_override','updated_at'],
      product_executions:['name','is_rentable_override','is_sellable_override','show_on_website_override','updated_at'],product_variants:['is_active','size_id','sku','updated_at'],stock_levels:['quantity','updated_at']};
    if(scope){args=[org,scope[1]];const target=`organization_id=$1 AND ${scope[0]}=ANY($2::uuid[])`;
      if(table==='product_prices')where=`NOT (${target})`;
      else{args.push(mutable[table]);projection=`CASE WHEN ${target} THEN to_jsonb(t)-$3::text[] ELSE to_jsonb(t) END`;}}
    else if(extra){where='NOT (organization_id=$1 AND id=ANY($2::uuid[]))';args=[org,extra];}
    // Only counts/digests leave PostgreSQL; photos, customer/financial/document rows are not printed.
    const row=(await client.query(`SELECT count(*)::text n,md5(COALESCE(string_agg(md5(v::text),'' ORDER BY v::text),'')) digest FROM (SELECT ${projection} v FROM public."${table}" t WHERE ${where}) protected_rows`,args)).rows[0];
    result.push([table,row.n,row.digest]);
  }
  return sha(result);
}
function transactionOptions(plan,r,mode,gate=()=>{}){
  return {mode,verifySchema:async client=>{await client.query('SET LOCAL row_security=off');assert.equal(await schemaFingerprint(client),r.schemaSha,'Schema drift');},
    verifyPreservation:async(client,expected)=>{const current=await preservationFingerprint(client,plan);if(expected!==undefined)assert.equal(current,expected,'Preserved rows drift (photos/history/other tenants)');return current;},
    beforeCommit:gate};
}
async function run({mode='offline',manifestPath,at,requestPath,confirmation},env=process.env){
  assert.ok(['offline','inspect','preflight','apply'].includes(mode));
  const r=requestPath?JSON.parse(fs.readFileSync(requestPath,'utf8')):null;
  const plan=offline(manifestPath,r?.applicationTimestamp??at);
  if(mode==='offline')return {mode,connectionOpened:false,manifestSha:MANIFEST,codeSha:codeSha(),releaseSha:RELEASE,tenantId:TENANT,totals:{units:4826,activeVariants:994,prices:1184},canonicalQuantities:[14,4]};
  validateRequest(r,plan);
  if(mode==='apply')verifyApplyGate(r,confirmation);
  assert.ok(!env.PGOPTIONS,'PGOPTIONS override forbidden');
  const config=connectionConfig(r,env.MARIPOSA_IMPORT_DATABASE_URL);
  const {Client}=require('pg');const client=new Client(config);let connected=false;
  try{
    await client.connect();connected=true;await verifyIdentity(client);
    await client.query("SET TIME ZONE 'UTC'");
    if(mode==='inspect'){
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try{return {mode,schemaSha:await schemaFingerprint(client),tenantId:TENANT,projectId:PROJECT};}finally{await client.query('ROLLBACK');}
    }
    const gate=()=>verifyApplyGate(r,confirmation);
    return await executeWorkbookTransaction(client,plan,transactionOptions(plan,r,mode,gate));
  }finally{if(connected)await client.end();}
}
function parseArgs(argv){
  const args={},allowed=new Set(['--manifest','--at','--request','--confirm']);let mode='offline',chosen=false;
  for(let i=0;i<argv.length;i++){const key=argv[i];if(['--dry-run','--inspect','--preflight','--apply'].includes(key)){assert.ok(!chosen,'Choose one mode');chosen=true;mode=key==='--dry-run'?'offline':key.slice(2);}
    else{assert.ok(allowed.has(key)&&!Object.hasOwn(args,key)&&argv[i+1]&&!argv[i+1].startsWith('--'),'Unknown/duplicate/missing argument');args[key]=argv[++i];}}
  assert.ok(args['--manifest'],'--manifest is required');
  return {mode,manifestPath:args['--manifest'],at:args['--at'],requestPath:args['--request'],confirmation:args['--confirm']};
}
if(require.main===module)run(parseArgs(process.argv.slice(2))).then(r=>console.log(JSON.stringify(r))).catch(()=>{
  // Never print pg connection errors, SQL parameters or credentials. Diagnose in a protected context.
  console.error('STOP: import gate/preflight/transaction failed. No automatic retry or fallback. Inspect protected evidence; database commit may be uncertain after connection loss.');process.exitCode=1;
});
module.exports={run,parseArgs,offline,validateRequest,verifyApplyGate,connectionConfig,verifyIdentity,schemaFingerprint,preservationFingerprint,preservedScopes,transactionOptions,codeSha,hashBytes,PROJECT,TENANT,MANIFEST,RELEASE,HOST,ACK};
