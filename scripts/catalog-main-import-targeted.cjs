// Opt-in targeted boundary tests. No production client/env, only NEW loopback synthetic DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {spawnSync}=require('node:child_process');
const runner=require('./catalog-main-import.cjs'),core=require('./catalog-workbook-transaction.cjs');
const {Client}=require('pg');
assert.equal(process.argv[2],'--allow-new-loopback-fixture');
const sourceRoot=path.resolve(process.argv[3]);
const output=path.resolve(process.argv[4]);fs.mkdirSync(output,{recursive:true});
const backup='C:/Users/Ameliestore/AppData/Local/MariposaCRM/Backups/20261005_073958/mariposa-database.dump';
const externalFile=path.join(sourceRoot,'full-schema-fixture.cjs');
// Reuse the prior synthetic seed only. Never call its old cluster/createFixture path.
const fixtureModule=new Module(externalFile,module);fixtureModule.filename=externalFile;fixtureModule.paths=Module._nodeModulePaths(sourceRoot);
fixtureModule._compile(fs.readFileSync(externalFile,'utf8')+'\nmodule.exports.seed=seed;',externalFile);
const fixture=fixtureModule.exports;
const config={host:'127.0.0.1',port:62317,user:'import_test',database:'postgres',connectionTimeoutMillis:3000};
const checks=[];let c;
async function test(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function main(){
  const manifestPath=path.join(sourceRoot,'full-workbook-dryrun-20261005.json'),at='2026-10-05T22:00:00.000Z';
  const plan=runner.offline(manifestPath,at),now=Date.parse(at);
  const proof=path.join(output,'synthetic-proof.txt');fs.writeFileSync(proof,'SYNTHETIC ONLY - NOT RELEASE EVIDENCE');
  const proofHash=runner.hashBytes(fs.readFileSync(proof));
  const request={version:1,projectId:runner.PROJECT,tenantId:runner.TENANT,manifestSha:runner.MANIFEST,releaseSha:runner.RELEASE,codeSha:runner.codeSha(),schemaSha:'a'.repeat(64),applicationTimestamp:at,
    database:{host:runner.HOST,port:5432,name:'postgres',user:'postgres'},
    authorization:{scope:runner.ACK,approvedBy:'synthetic-test',approvedAt:'2026-10-05T21:30:00.000Z',expiresAt:'2026-10-05T22:30:00.000Z'},
    barrier:{path:proof,sha256:proofHash,verifiedAt:'2026-10-05T21:35:00.000Z',drainedAt:'2026-10-05T21:40:00.000Z'},
    backup:{path:proof,sha256:proofHash,snapshotAt:'2026-10-05T21:45:00.000Z',restoreVerifiedAt:'2026-10-05T21:50:00.000Z'}};
  await test('offline default cannot load pg or connect; exact Main manifest and 14/4',async()=>{
    const saved=Module._load;Module._load=function(name,...args){assert.notEqual(name,'pg');return saved.call(this,name,...args);};
    try{const r=await runner.run({manifestPath,at},{});assert.equal(r.connectionOpened,false);assert.deepEqual(r.canonicalQuantities,[14,4]);}finally{Module._load=saved;}
    assert.throws(()=>runner.offline(manifestPath+'-missing',at));assert.throws(()=>core.compileManifest(Buffer.from('{}'),runner.MANIFEST,at));
  });
  await test('strict identity and request gate rejects wrong tenant/host/code/release/extra fields',async()=>{
    runner.validateRequest(request,plan);
    for(const key of ['projectId','tenantId','manifestSha','releaseSha','codeSha'])assert.throws(()=>runner.validateRequest({...request,[key]:'wrong'},plan));
    assert.throws(()=>runner.validateRequest({...request,password:'forbidden'},plan));
    assert.throws(()=>runner.validateRequest({...request,database:{...request.database,host:'localhost'}},plan));
    assert.throws(()=>runner.connectionConfig(request,'postgresql://postgres:dummy@foreign.invalid/postgres'));
    assert.throws(()=>runner.connectionConfig(request,`postgresql://postgres:dummy@${runner.HOST}/postgres?sslmode=disable`));
    assert.equal(runner.connectionConfig(request,`postgresql://postgres:synthetic@${runner.HOST}/postgres`).ssl.rejectUnauthorized,true);
  });
  await test('apply requires confirmation, unexpired approval, ordered fresh backup and exact evidence bytes',async()=>{
    runner.verifyApplyGate(request,runner.ACK,now);
    assert.throws(()=>runner.verifyApplyGate(request,undefined,now));assert.throws(()=>runner.verifyApplyGate(request,runner.ACK,now+7200000));
    assert.throws(()=>runner.verifyApplyGate({...request,applicationTimestamp:'2026-10-05T12:00:00.000Z'},runner.ACK,now));
    assert.throws(()=>runner.verifyApplyGate({...request,applicationTimestamp:'2026-10-05T22:01:00.000Z'},runner.ACK,now));
    assert.throws(()=>runner.verifyApplyGate({...request,backup:{...request.backup,snapshotAt:'2026-10-05T07:40:00.431Z'}},runner.ACK,now));
    assert.throws(()=>runner.verifyApplyGate({...request,barrier:{...request.barrier,sha256:'0'.repeat(64)}},runner.ACK,now));
    assert.throws(()=>runner.parseArgs(['--apply','--preflight','--manifest','unused']));
    const requestPath=path.join(output,'synthetic-request.json');fs.writeFileSync(requestPath,JSON.stringify(request));
    await assert.rejects(runner.run({mode:'apply',manifestPath,requestPath},{}));
  });
  await test('old isolated entry still rejects Main-shaped server before BEGIN',async()=>{
    const calls=[];await assert.rejects(require('./catalog-workbook-import.cjs').executeIsolatedImport({query:async sql=>{calls.push(sql);return {rows:[{db:'postgres',host:'203.0.113.1',directory:'not-local'}]};}},plan,{isolatedDirectory:output}));
    assert.equal(calls.length,1);assert.ok(!calls.some(s=>s.startsWith('BEGIN')));
  });
  if(process.argv[5]==='--gates-only'){
    fs.writeFileSync(path.join(output,'gate-result.json'),JSON.stringify({status:'PASS',checks,codeSha:runner.codeSha(),mainConnections:0,externalCalls:0},null,2));return;
  }
  assert.equal(runner.hashBytes(fs.readFileSync(backup)),'5690b7cbec5c21d1527e2f507cf1904e7aa8bafd0adbbcd34ec361f0ed18ca13');
  const control=new Client(config);await control.connect();
  const expectedDirectory=path.join(output,'pgdata');
  const identity=(await control.query("SELECT current_setting('data_directory') dir,inet_server_port() port")).rows[0];
  assert.equal(path.resolve(identity.dir).toLowerCase(),expectedDirectory.toLowerCase());assert.equal(identity.port,62317);
  const dbName='crm_main_boundary_'+Date.now();await control.query('CREATE DATABASE "'+dbName+'" TEMPLATE template0');await control.end();
  c=new Client({...config,database:dbName});await c.connect();await c.query('CREATE EXTENSION btree_gist WITH SCHEMA public');await c.end();
  const fd=fs.openSync(path.join(output,'schema-restore.log'),'a');
  const restored=spawnSync('C:/Program Files/PostgreSQL/17/bin/pg_restore.exe',['--host=127.0.0.1','--port=62317','--username=import_test','--dbname='+dbName,'--schema-only','--schema=public','--no-owner','--no-acl','--exit-on-error','--single-transaction',backup],{env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,PGPASSWORD:'',PGSSLMODE:'disable'},stdio:['ignore',fd,fd],windowsHide:true,timeout:60000});fs.closeSync(fd);assert.equal(restored.status,0);
  c=new Client({...config,database:dbName});await c.connect();await c.query("SET TIME ZONE 'UTC'");
  await c.query(fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261005100000_execution_operation_policy/migration.sql'),'utf8'));
  const m=fixture.syntheticManifest();assert.notEqual(m.organization_id,runner.TENANT);
  await c.query('BEGIN');await fixture.seed(c,m);await c.query('COMMIT');
  const bytes=Buffer.from(JSON.stringify(m)),syntheticPlan=core.compileManifest(bytes,core.sha(bytes.toString()),at);
  const r={schemaSha:await runner.schemaFingerprint(c)};
  const fingerprint=async()=>core.sha(await fixture.allRows(c));
  const initial=await fingerprint();
  await test('real PostgreSQL preflight is read-only and preserves every synthetic table',async()=>{
    const queries=[],adapter={query:async(...args)=>{queries.push(args[0]);return c.query(...args);}};
    const result=await core.executeWorkbookTransaction(adapter,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'preflight'));
    assert.equal(result.preflight,true);assert.equal(result.writes,0);assert.equal(await fingerprint(),initial);
    assert.ok(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.ok(!queries.some(s=>/^(UPDATE|INSERT|DELETE)|FOR (UPDATE|SHARE|NO KEY)|pg_advisory/.test(s)));
  });
  await test('schema and baseline stock drift stop before mutation',async()=>{
    await assert.rejects(core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,{schemaSha:'0'.repeat(64)},'apply')),/Schema drift/);
    const sl=m.variant_targets[0].stock_rows_before[0];await c.query('UPDATE stock_levels SET quantity=quantity+1 WHERE id=$1',[sl.id]);const drift=await fingerprint();
    await assert.rejects(core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'apply')),/stock row distribution/);assert.equal(await fingerprint(),drift);
    await c.query('UPDATE stock_levels SET quantity=$2 WHERE id=$1',[sl.id,sl.quantity]);assert.equal(await fingerprint(),initial);
  });
  await test('expiry at commit boundary rolls back all imported rows and marker',async()=>{
    await assert.rejects(core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'apply',()=>{throw Error('approval expired');})),/approval expired/);
    assert.equal(await fingerprint(),initial);
  });
  await test('photo change inside transaction rejects and atomically rolls back',async()=>{
    const options=runner.transactionOptions(syntheticPlan,r,'apply');options.beforeWrites=()=>c.query("UPDATE product_images SET storage_key=storage_key||'-unexpected'");
    await assert.rejects(core.executeWorkbookTransaction(c,syntheticPlan,options),/Preserved rows drift/);assert.equal(await fingerprint(),initial);
  });
  await test('Main boundary hooks on synthetic full schema preserve photos/history and apply 14/4 once',async()=>{
    const result=await core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'apply'));
    assert.deepEqual(result.totals,{units:4826,activeVariants:994,prices:1184});
    for(const pair of m.merge_pairs){const rows=(await c.query('SELECT product_variant_id,sum(quantity)::int n FROM stock_levels WHERE product_variant_id=ANY($1::uuid[]) GROUP BY product_variant_id',[[pair.canonical_variant_id,pair.donor_variant_id]])).rows;assert.equal(rows.find(x=>x.product_variant_id===pair.canonical_variant_id).n,pair.after_pair_units);assert.equal(rows.find(x=>x.product_variant_id===pair.donor_variant_id).n,0);}
  });
  await test('exact replay is zero writes; price and photo drift reject replay',async()=>{
    const before=await fingerprint();const replay=await core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'apply'));
    assert.equal(replay.replayed,true);assert.equal(replay.writes,0);assert.equal(await fingerprint(),before);
    await c.query('UPDATE product_prices SET amount_minor=amount_minor+1 WHERE id=$1',[m.price_deltas[0].deterministic_id]);
    await assert.rejects(core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'preflight')),/replay after-state/);
    await c.query('UPDATE product_prices SET amount_minor=amount_minor-1 WHERE id=$1',[m.price_deltas[0].deterministic_id]);
    await c.query("UPDATE product_images SET storage_key=storage_key||'-drift'");const drift=await fingerprint();
    await assert.rejects(core.executeWorkbookTransaction(c,syntheticPlan,runner.transactionOptions(syntheticPlan,r,'preflight')),/Preserved rows drift/);assert.equal(await fingerprint(),drift);
  });
  const report={status:'PASS',checks,codeSha:runner.codeSha(),database:dbName,sourceManifestSha:runner.MANIFEST,mainConnections:0,externalCalls:0,syntheticOnly:true,limitations:['No live endpoint, credentials, RLS-role or WAF/barrier verification','Schema-only backup cutoff 07:40 UTC; prior business rehearsal not repeated']};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(c)await c.end();});
