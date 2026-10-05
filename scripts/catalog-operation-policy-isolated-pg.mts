// Opt-in PostgreSQL test. Never reads DATABASE_URL, app env files or lib/db.
// Requires a separately initialized loopback cluster inside crm-price-audit.
// Creates a NEW synthetic database per run; no real orders, finance or messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Client, Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { variantsAllowOperation } from '../lib/catalog/operation-policy-guard.ts';

assert.equal(process.argv[2], '--allow-isolated-policy-test');
const evidenceRoot=path.resolve(process.cwd(),'../crm-price-audit');
const connection=JSON.parse(fs.readFileSync(path.join(evidenceRoot,'isolated-policy-pg-connection.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(connection.host,'127.0.0.1');assert.ok(connection.port>10000&&connection.port!==5432);
assert.equal(connection.user,'policy_test');
assert.ok(path.resolve(connection.dataDirectory).toLowerCase().startsWith(evidenceRoot.toLowerCase()+path.sep));
const config={host:'127.0.0.1',port:connection.port,user:'policy_test',database:'postgres',connectionTimeoutMillis:3000};
const normalize=(value:string)=>path.resolve(value).toLowerCase();
const control=new Client(config);await control.connect();
const identity=(await control.query("SELECT current_setting('data_directory') AS directory,inet_server_port() AS port,current_user AS username,version() AS version")).rows[0];
assert.equal(normalize(identity.directory),normalize(connection.dataDirectory));assert.equal(identity.port,connection.port);assert.equal(identity.username,'policy_test');
const database='policy_test_'+Date.now();assert.match(database,/^policy_test_\d+$/);
await control.query('CREATE DATABASE "'+database+'"');await control.end();
config.database=database;
const setup=new Client(config),writer=new Client(config),monitor=new Client(config),blocker=new Client(config);
const pools=[new Pool({...config,max:3}),new Pool({...config,max:3})];
const prisma=new PrismaClient({adapter:new PrismaPg(pools[0])}),prisma2=new PrismaClient({adapter:new PrismaPg(pools[1])});
const org='11111111-1111-4111-8111-111111111111',product='33333333-3333-4333-8333-333333333333',other='66666666-6666-4666-8666-666666666666',execution='44444444-4444-4444-8444-444444444444',size='55555555-5555-4555-8555-555555555555',variant='22222222-2222-4222-8222-222222222222';
const checks:Array<{name:string;status:string}> = [];
let migrationElapsed=0;
async function test(name:string,fn:()=>Promise<void>){await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}
async function waitUntilBlocked(pid:number){
  const deadline=Date.now()+3000;
  while(Date.now()<deadline){const state=(await monitor.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
    if(state?.wait_event_type==='Lock'&&state.blockers.length)return state;
    await new Promise(resolve=>setTimeout(resolve,20));}
  throw Error('Expected real PostgreSQL lock wait was not observed');
}
async function resetFlags(){await setup.query(`UPDATE public.products SET is_rentable=true,is_sellable=true,show_on_website=true WHERE id=$1;
`,[product]);await setup.query('UPDATE public.product_executions SET product_id=$2,is_active=true,is_rentable_override=NULL,is_sellable_override=NULL,show_on_website_override=NULL WHERE id=$1',[execution,product]);
  await setup.query('UPDATE public.product_variants SET is_active=true WHERE id=$1',[variant]);await setup.query('UPDATE public.sizes SET is_active=true WHERE id=$1',[size]);}
const migration=fs.readFileSync(path.resolve('prisma/migrations/20261005100000_execution_operation_policy/migration.sql'),'utf8');
assert.match(migration,/BEGIN;/);assert.match(migration,/COMMIT;/);assert.match(migration,/lock_timeout\s*=\s*'2s'/);assert.match(migration,/statement_timeout\s*=\s*'15s'/);
try {
  await Promise.all([setup.connect(),writer.connect(),monitor.connect(),blocker.connect()]);
  const count=(await setup.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'")).rows[0].count;assert.equal(count,0);
  await setup.query(`CREATE TYPE public."PublicationStatus" AS ENUM ('DRAFT','ACTIVE','ARCHIVED');
    CREATE TABLE public.products(id uuid PRIMARY KEY,organization_id uuid NOT NULL,archived_at timestamptz,publication_status public."PublicationStatus" NOT NULL DEFAULT 'ACTIVE',is_rentable boolean NOT NULL,is_sellable boolean NOT NULL,show_on_website boolean NOT NULL);
    CREATE TABLE public.product_executions(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES public.products(id),is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.sizes(id uuid PRIMARY KEY,organization_id uuid NOT NULL,is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.product_variants(id uuid PRIMARY KEY,organization_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES public.products(id),execution_id uuid REFERENCES public.product_executions(id),size_id uuid NOT NULL REFERENCES public.sizes(id),is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.isolated_policy_commitments(id uuid PRIMARY KEY,variant_id uuid NOT NULL);
  `);
  await setup.query('INSERT INTO public.products(id,organization_id,is_rentable,is_sellable,show_on_website) VALUES($1,$2,true,true,true),($3,$2,false,false,false)',[product,org,other]);
  await setup.query('INSERT INTO public.product_executions(id,organization_id,product_id) VALUES($1,$2,$3)',[execution,org,product]);
  await setup.query('INSERT INTO public.sizes(id,organization_id) VALUES($1,$2)',[size,org]);
  await setup.query('INSERT INTO public.product_variants(id,organization_id,product_id,execution_id,size_id) VALUES($1,$2,$3,$4,$5)',[variant,org,product,execution,size]);

  await test('exact additive migration preserves legacy flags and NULL inheritance on PostgreSQL',async()=>{
    const before=(await setup.query('SELECT id,is_rentable,is_sellable,show_on_website FROM public.products ORDER BY id')).rows;
    await setup.query(migration);
    const columns=(await setup.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND column_name LIKE '%override%' ORDER BY table_name,column_name")).rows;
    assert.equal(columns.length,6);for(const c of columns){assert.equal(c.data_type,'boolean');assert.equal(c.is_nullable,'YES');assert.equal(c.column_default,null);}
    assert.deepEqual((await setup.query('SELECT id,is_rentable,is_sellable,show_on_website FROM public.products ORDER BY id')).rows,before);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM public.products WHERE direct_is_rentable_override IS NOT NULL OR direct_is_sellable_override IS NOT NULL OR direct_show_on_website_override IS NOT NULL')).rows[0].count,0);
    await prisma.$transaction(async tx=>{assert.equal(await variantsAllowOperation(tx,org,[variant],'RENTAL',true),true);assert.equal(await variantsAllowOperation(tx,org,[variant],'SALE',true),true);});
  });

  await test('second ALTER failure rolls back first ALTER; no partial schema',async()=>{
    await setup.query('CREATE SCHEMA atomic_probe; CREATE TABLE atomic_probe.products(id uuid); CREATE TABLE atomic_probe.product_executions(id uuid,is_rentable_override boolean); SET search_path TO atomic_probe;');
    await assert.rejects(setup.query(migration),(error:unknown)=>error instanceof Error && 'code' in error && error.code==='42701');await setup.query('ROLLBACK; SET search_path TO public;');
    assert.equal((await setup.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='atomic_probe' AND table_name='products' AND column_name LIKE '%override%'")).rows[0].count,0);
  });

  await test('real ACCESS EXCLUSIVE contention aborts migration at bounded lock timeout atomically',async()=>{
    await setup.query('CREATE SCHEMA lock_probe; CREATE TABLE lock_probe.products(id uuid); CREATE TABLE lock_probe.product_executions(id uuid); SET search_path TO lock_probe;');
    await blocker.query('BEGIN; SELECT * FROM lock_probe.products;');
    const start=Date.now();await assert.rejects(setup.query(migration),(error:unknown)=>error instanceof Error && 'code' in error && error.code==='55P03');migrationElapsed=Date.now()-start;
    assert.ok(migrationElapsed>=1500&&migrationElapsed<6000);await setup.query('ROLLBACK; SET search_path TO public;');await blocker.query('COMMIT;');
    assert.equal((await setup.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='lock_probe' AND column_name LIKE '%override%'")).rows[0].count,0);
  });

  await test('execution disable after successful check waits for commitment commit, then blocks new operation',async()=>{
    await resetFlags();let release!:()=>void,checked!:()=>void;const hold=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>checked=r);
    const operation=prisma.$transaction(async tx=>{assert.equal(await variantsAllowOperation(tx,org,[variant],'RENTAL'),true);checked();await hold;await tx.$executeRaw`INSERT INTO public.isolated_policy_commitments(id,variant_id) VALUES(${randomUUID()}::uuid,${variant}::uuid)`;},{timeout:10000});
    await ready;await writer.query('BEGIN');const update=writer.query('UPDATE public.product_executions SET is_rentable_override=false WHERE id=$1',[execution]);
    await waitUntilBlocked(writer.processID!);release();await operation;await update;await writer.query('COMMIT');
    await prisma.$transaction(async tx=>assert.equal(await variantsAllowOperation(tx,org,[variant],'RENTAL'),false));
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM public.isolated_policy_commitments')).rows[0].count,1);
  });

  await test('disable commits while guard waits: real READ COMMITTED recheck rejects without commitment',async()=>{
    await resetFlags();await writer.query('BEGIN');await writer.query('UPDATE public.product_executions SET is_rentable_override=false WHERE id=$1',[execution]);
    let guardPid=0;const pending=prisma.$transaction(async tx=>{guardPid=(await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`)[0].pid;
      const allowed=await variantsAllowOperation(tx,org,[variant],'RENTAL');if(allowed)await tx.$executeRaw`INSERT INTO public.isolated_policy_commitments(id,variant_id) VALUES(${randomUUID()}::uuid,${variant}::uuid)`;return allowed;},{timeout:10000});
    while(!guardPid)await new Promise(resolve=>setTimeout(resolve,10));await waitUntilBlocked(guardPid);await writer.query('COMMIT');assert.equal(await pending,false);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM public.isolated_policy_commitments')).rows[0].count,1);
  });

  await test('legacy model, variant, size and publication UPDATE conflict with corresponding real guard locks',async()=>{
    for(const query of ['UPDATE public.products SET is_rentable=false WHERE id=\''+product+'\'','UPDATE public.product_variants SET is_active=false WHERE id=\''+variant+'\'','UPDATE public.sizes SET is_active=false WHERE id=\''+size+'\'','UPDATE public.product_executions SET show_on_website_override=false WHERE id=\''+execution+'\'']){
      await resetFlags();let checked!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>checked=r),hold=new Promise<void>(r=>release=r);
      const op=prisma.$transaction(async tx=>{assert.equal(await variantsAllowOperation(tx,org,[variant],'RENTAL',true),true);checked();await hold;},{timeout:10000});
      await ready;await writer.query('BEGIN');const update=writer.query(query);await waitUntilBlocked(writer.processID!);release();await op;await update;await writer.query('COMMIT');
      await prisma2.$transaction(async tx=>assert.equal(await variantsAllowOperation(tx,org,[variant],'RENTAL',true),false));
    }
  });

  await test('foreign execution binding and foreign tenant fail closed on the real query path',async()=>{
    await resetFlags();await setup.query('UPDATE public.product_executions SET product_id=$1 WHERE id=$2',[other,execution]);
    await prisma.$transaction(async tx=>assert.equal(await variantsAllowOperation(tx,org,[variant],'RENTAL'),false));
    await resetFlags();await prisma.$transaction(async tx=>assert.equal(await variantsAllowOperation(tx,other,[variant],'RENTAL'),false));
  });
  await test('reverse-input batch B,A waits on A first and cannot deadlock a sorted A,B writer',async()=>{
    await resetFlags();const second='77777777-7777-4777-8777-777777777777';
    await setup.query('INSERT INTO public.product_variants(id,organization_id,product_id,execution_id,size_id) VALUES($1,$2,$3,$4,$5)',[second,org,product,execution,size]);
    await writer.query('BEGIN; SET LOCAL statement_timeout=1500');
    await writer.query('SELECT id FROM public.product_variants WHERE id=$1 FOR UPDATE',[variant]);
    let guardPid=0;
    const pending=prisma.$transaction(async tx=>{
      guardPid=(await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`)[0].pid;
      return variantsAllowOperation(tx,org,[second,variant],'RENTAL');
    },{timeout:10000});
    while(!guardPid)await new Promise(resolve=>setTimeout(resolve,10));
    await waitUntilBlocked(guardPid);
    // If reverse input had locked B first, this would time out (or deadlock).
    await writer.query('SELECT id FROM public.product_variants WHERE id=$1 FOR UPDATE',[second]);
    await writer.query('COMMIT');assert.equal(await pending,true);
  });
  const evidence={status:'PASS_ISOLATED_POSTGRESQL',database,serverVersion:identity.version,dataDirectory:identity.directory,host:'127.0.0.1',port:connection.port,checks,
    engine:'Actual generated PrismaClient + PrismaPg adapter + real transaction guard; blocking observed through pg_stat_activity/pg_blocking_pids',migrationSha256:createHash('sha256').update(migration).digest('hex'),migrationLockTimeoutElapsedMs:migrationElapsed,
    syntheticCommitments:1,productionConnections:0,liveDatabaseWrites:0,financialOperations:0,customerMessages:0};
  fs.writeFileSync(path.join(evidenceRoot,'isolated-policy-postgres-verification-20261005.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:evidence.status,tests:checks.length,version:identity.version,lockTimeoutMs:migrationElapsed,database},null,2));
} finally {
  await Promise.allSettled([writer.query('ROLLBACK'),blocker.query('ROLLBACK'),setup.query('ROLLBACK')]);
  await Promise.allSettled([prisma.$disconnect(),prisma2.$disconnect()]);
  await Promise.allSettled(pools.map(pool=>pool.end()));
  await Promise.allSettled([setup.end(),writer.end(),monitor.end(),blocker.end()]);
}
