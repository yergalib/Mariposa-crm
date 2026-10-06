// Shared transaction core. No network client, credentials, CLI, or schema writes.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const stable = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
const uuid = key => {
  const bytes=createHash('sha1').update(Buffer.from('8e597c3f926c56f0a209a66c97d82f12','hex')).update(key).digest();
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const h=bytes.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
};
const sorted = ids => [...new Set(ids)].sort();
const same = (a,b,label) => assert.equal(stable(a),stable(b),`DRIFT: ${label}`);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function compileManifest(bytes, expectedManifestSha, approvedAt) {
  assert.equal(sha(bytes.toString()), expectedManifestSha, 'Manifest bytes must match separately reviewed SHA');
  const m = JSON.parse(bytes.toString());
  assert.equal(m.status,'FULL_READ_ONLY_DRYRUN_NO_APPLICATION');
  assert.match(m.workbook_sha256,/^[a-f0-9]{64}$/);
  assert.match(m.organization_id,uuidPattern);
  assert.ok(Number.isFinite(Date.parse(approvedAt)) && new Date(approvedAt).toISOString() === approvedAt,'One exact UTC application timestamp required');
  same([m.groups.length,m.variant_targets.length,m.models.length],[444,1052,330],'complete workbook dimensions');
  assert.equal(new Set(m.variant_targets.map(v=>v.variant_id)).size,1052);
  assert.equal(new Set(m.groups.map(g=>`${g.product_id}:${g.execution_id}`)).size,444);
  const variants = new Map(m.variant_targets.map(v=>[v.variant_id,v]));
  for (const g of m.groups) {
    for (const flag of ['isRentableOverride','isSellableOverride','showOnWebsiteOverride']) assert.equal(typeof g[flag],'boolean');
    for (const id of g.variant_ids) { const v=variants.get(id); assert.ok(v); same([v.product_id,v.execution_id,v.group_key],[g.product_id,g.execution_id,g.key],'group identity'); }
  }
  for (const v of m.variant_targets) {
    for (const id of [v.variant_id,v.product_id,v.size_id_before,v.size_id_after,...v.source_ids_preserved]) assert.match(id,uuidPattern);
    assert.ok(Number.isInteger(v.stock_before)&&v.stock_before>=0&&Number.isInteger(v.stock_after)&&v.stock_after>=0);
    assert.equal(v.stock_delta,v.stock_after-v.stock_before);
    assert.ok(v.stock_delta<=0 && (v.stock_delta===0 || v.stock_after===0),'Only reviewed negative corrections to zero supported');
    assert.equal(v.current_prices.length,0,'This release supports only the reviewed empty price baseline');
    assert.equal(v.stock_rows_before.reduce((n,s)=>n+s.quantity,0),v.stock_before);
  }
  same([m.variant_targets.reduce((n,v)=>n+v.stock_before,0),m.variant_targets.reduce((n,v)=>n+v.stock_after,0)],[4915,4826],'stock totals');
  same(m.merge_pairs.map(p=>[p.canonical_delta,p.donor_delta,p.after_pair_units]),[[0,-7,14],[0,-2,4]],'owner quantities 14/4');
  assert.equal(m.price_deltas.length,1184);
  assert.equal(new Set(m.price_deltas.map(p=>p.deterministic_id)).size,1184);
  for (const p of m.price_deltas) { assert.ok(variants.has(p.variant_id));assert.ok(['SALE','RENTAL'].includes(p.type));assert.match(p.amount_minor,/^\d+$/);assert.equal(p.currency,'KZT');assert.equal(p.branch_id,null);assert.match(p.deterministic_id,uuidPattern); }
  return { manifest:m, canonicalSha:sha(m), manifestSha:expectedManifestSha, approvedAt, markerId:uuid(`workbook:${m.organization_id}:${expectedManifestSha}`) };
}

async function executeWorkbookTransaction(client,plan,options={}) {
  const apply=options.mode==='apply';
  assert.ok(options.mode===undefined||['apply','preflight'].includes(options.mode),'Unknown transaction mode');
  assert.equal(sha(plan.manifest),plan.canonicalSha,'Compiled manifest changed after review');
  const {manifest:m,manifestSha,approvedAt,markerId}=plan, org=m.organization_id;
  const ids=sorted(m.variant_targets.map(v=>v.variant_id)), productIds=sorted(m.models.map(p=>p.product_id)), executionIds=sorted(m.groups.flatMap(g=>g.execution_id?[g.execution_id]:[]));
  const select=async(table,column,values,lock='') => (await client.query(`SELECT * FROM public.${table} WHERE organization_id=$1 AND ${column}=ANY($2::uuid[]) ORDER BY id ${apply ? lock : ""}`,[org,values])).rows;
  const changedTables=['products','product_executions','product_variants','stock_levels','product_prices'];
  const state=async()=>{const rows={};for(const table of changedTables)rows[table]=await select(table,['products','product_executions','product_variants'].includes(table)?'id':'product_variant_id',table==='products'?productIds:table==='product_executions'?executionIds:ids);return rows;};
  const history=async()=>{
    const rows={};for(const table of ['catalog_source_references','inventory_movements','order_items','capacity_allocations','sale_inventory_commitments'])rows[table]=await select(table,'product_variant_id',ids);
    rows.stock_adjustments=await select('stock_adjustments','stock_level_id',sorted(m.variant_targets.flatMap(v=>v.stock_rows_before.map(s=>s.id))));
    return rows;
  };
  let writes=0;
  const write=async(sql,params)=>{const r=await client.query(sql,params);writes++;if(options.failAfterWrites===writes)throw Error('INJECTED_REHEARSAL_FAILURE');return r;};
  await client.query(apply ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'");
    if(apply) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`workbook:${org}:${manifestSha}`]);
    if(options.verifySchema) await options.verifySchema(client);
    const prior=(await client.query('SELECT metadata FROM public.audit_logs WHERE id=$1 AND organization_id=$2',[markerId,org])).rows[0];
    if(prior){same(prior.metadata.manifestSha,manifestSha,'replay SHA');same(prior.metadata.approvedAt,approvedAt,'replay timestamp');same(sha(await state()),prior.metadata.afterFingerprint,'replay after-state');same(sha(await history()),prior.metadata.afterHistoryFingerprint,'replay history');if(options.verifyPreservation){assert.match(prior.metadata.preservationFingerprint??'',/^[a-f0-9]{64}$/,'Replay lacks preservation evidence');await options.verifyPreservation(client,prior.metadata.preservationFingerprint);}await client.query('ROLLBACK');return {replayed:true,writes:0,totals:prior.metadata.totals};}
    const variants=await select('product_variants','id',ids,'FOR NO KEY UPDATE');assert.equal(variants.length,1052,'Missing/foreign variants');
    const products=await select('products','id',productIds,'FOR NO KEY UPDATE');assert.equal(products.length,330);
    const executions=await select('product_executions','id',executionIds,'FOR NO KEY UPDATE');assert.equal(executions.length,executionIds.length);
    const sizeIds=sorted([...variants.map(v=>v.size_id),...m.variant_targets.map(v=>v.size_id_after)]);
    const sizes=await select('sizes','id',sizeIds,'FOR NO KEY UPDATE');assert.equal(sizes.length,sizeIds.length);
    const byVariant=new Map(variants.map(v=>[v.id,v])), byExecution=new Map(executions.map(e=>[e.id,e]));
    for(const p of m.models){const row=products.find(x=>x.id===p.product_id);for(const f of ['name','is_rentable','is_sellable','show_on_website','publication_status','archived_at'])same(row[f],p.before[f],`model ${p.product_id}/${f}`);assert.equal(row.tracking_mode,'BULK');for(const f of ['direct_is_rentable_override','direct_is_sellable_override','direct_show_on_website_override'])same(row[f],null,'initial DIRECT override');}
    for(const g of m.groups.filter(g=>g.execution_id)){const e=byExecution.get(g.execution_id);same([e.product_id,e.name,e.is_active],[g.product_id,g.execution_before,true],'execution binding');for(const f of ['is_rentable_override','is_sellable_override','show_on_website_override'])same(e[f],null,'initial execution override');}
    // Catalogue locks conflict with policy SHARE locks but allow foreign-key KEY SHARE.
    // Capacity precedes stock-row locks, matching existing stock writers.
    const levelReferences=await select('stock_levels','product_variant_id',ids);
    const keys=sorted(levelReferences.map(s=>`capacity:${org}:${s.branch_id}:${s.product_variant_id}`));if(apply) for(const key of keys)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    // Upgrade after capacity acquisition: freeze even FK inserts, then read a fresh baseline.
    await select('product_variants','id',ids,'FOR UPDATE');
    const before=await state();
    const levels=await select('stock_levels','product_variant_id',ids,'FOR UPDATE');
    assert.equal(before.product_prices.length,0,'DRIFT: price baseline');
    for(const v of m.variant_targets){const row=byVariant.get(v.variant_id);same([row.product_id,row.execution_id,row.size_id,row.sku,row.is_active],[v.product_id,v.execution_id,v.size_id_before,v.sku_before,v.is_active_before],'variant before-state');const actual=levels.filter(s=>s.product_variant_id===v.variant_id).map(s=>[s.id,s.branch_id,s.location_id,s.quantity]).sort();const expected=v.stock_rows_before.map(s=>[s.id,s.branch_id,s.location_id,s.quantity]).sort();same(actual,expected,'stock row distribution');for(const s of sizes.filter(s=>s.id===v.size_id_after))assert.equal(s.is_active,true);}
    const sources=await select('catalog_source_references','product_variant_id',ids,'FOR SHARE');
    assert.equal(sources.length,1063);for(const v of m.variant_targets){const refs=sources.filter(s=>s.product_variant_id===v.variant_id);same(sorted(refs.map(s=>s.id)),sorted(v.source_ids_preserved),'source IDs');same(sorted(refs.map(s=>s.source_key)),sorted(v.source_keys_preserved),'source keys');for(const s of refs)same([s.product_id,s.execution_id],[v.product_id,v.execution_id],'source binding');}
    const movements=await select('inventory_movements','product_variant_id',ids,'FOR SHARE');
    for(const v of m.variant_targets)assert.equal(movements.filter(s=>s.product_variant_id===v.variant_id).length,v.movement_count_preserved,'DRIFT: movement history');
    const items=await select('order_items','product_variant_id',ids,'FOR SHARE');
    for(const v of m.variant_targets)same(sorted(items.filter(i=>i.product_variant_id===v.variant_id).map(i=>i.id)),sorted(v.order_items_unchanged.map(i=>i.id)),'order history drift');
    // Conservative release: any new live operational dependency requires fresh review.
    const allocations=await select('capacity_allocations','product_variant_id',ids,'FOR SHARE');
    assert.ok(!allocations.some(a=>a.status==='ACTIVE'&&a.quantity>a.returned_quantity),'DRIFT: active/unreturned capacity');
    const commitments=await select('sale_inventory_commitments','product_variant_id',ids,'FOR SHARE');assert.ok(!commitments.some(s=>s.status==='ACTIVE'),'DRIFT: sale commitment');
    if(items.length){const orders=await select('orders','id',sorted(items.map(i=>i.order_id)),'FOR SHARE');assert.ok(!orders.some(o=>['DRAFT','RESERVED','CONFIRMED','ACTIVE','READY'].includes(o.status)),'DRIFT: open order');}
    const originalHistory=sha({sources,movements,items,allocations,commitments});
    const preservationFingerprint=options.verifyPreservation ? await options.verifyPreservation(client) : undefined;
    if(!apply){await client.query('ROLLBACK');return {preflight:true,replayed:false,writes:0,manifestSha,totals:{units:4826,activeVariants:994,prices:1184},preservationFingerprint};}
    if(options.beforeWrites)await options.beforeWrites(); // Isolated concurrency rehearsal hook.
    for(const p of m.models){const a=p.after;await write('UPDATE public.products SET name=$3,is_rentable=$4,is_sellable=$5,show_on_website=$6,publication_status=$7,archived_at=$8,direct_is_rentable_override=$9,direct_is_sellable_override=$10,direct_show_on_website_override=$11,updated_at=$12 WHERE id=$1 AND organization_id=$2',[p.product_id,org,a.name,a.is_rentable,a.is_sellable,a.show_on_website,a.publication_status,a.archived_at==='ONE_APPROVED_APPLICATION_TIMESTAMP'?approvedAt:a.archived_at,a.direct_is_rentable_override??null,a.direct_is_sellable_override??null,a.direct_show_on_website_override??null,approvedAt]);}
    for(const g of m.groups.filter(g=>g.execution_id))await write('UPDATE public.product_executions SET name=$3,is_rentable_override=$4,is_sellable_override=$5,show_on_website_override=$6,updated_at=$7 WHERE id=$1 AND organization_id=$2',[g.execution_id,org,g.execution_after,g.isRentableOverride,g.isSellableOverride,g.showOnWebsiteOverride,approvedAt]);
    for(const v of m.variant_targets)if(v.is_active_before!==v.is_active_after||v.size_id_before!==v.size_id_after||v.sku_before!==v.sku_after)await write('UPDATE public.product_variants SET is_active=$3,size_id=$4,sku=$5,updated_at=$6 WHERE id=$1 AND organization_id=$2',[v.variant_id,org,v.is_active_after,v.size_id_after,v.sku_after,approvedAt]);
    const appended=[];
    for(const v of m.variant_targets.filter(v=>v.stock_delta<0))for(const sl of v.stock_rows_before.filter(s=>s.quantity>0)){
      const adjustmentId=uuid(`${manifestSha}:adjustment:${sl.id}`),movementId=uuid(`${manifestSha}:movement:${sl.id}`),key=`workbook:${manifestSha.slice(0,24)}:${sl.id}`;
      const merge=m.merge_pairs.find(p=>p.donor_variant_id===v.variant_id),reason=merge?`Duplicate correction; canonical ${merge.canonical_variant_id} retains ${merge.after_pair_units}; donor ${v.variant_id}`:`Workbook absent correction: ${v.variant_id}`;
      await write('UPDATE public.stock_levels SET quantity=0,updated_at=$3 WHERE id=$1 AND organization_id=$2',[sl.id,org,approvedAt]);
      await write("INSERT INTO public.stock_adjustments(id,organization_id,stock_level_id,type,delta,resulting_quantity,reason,created_at) VALUES($1,$2,$3,'CORRECTION',$4,0,$5,$6)",[adjustmentId,org,sl.id,-sl.quantity,reason,approvedAt]);
      await write("INSERT INTO public.inventory_movements(id,organization_id,product_variant_id,type,quantity,from_branch_id,from_location_id,source_type,source_id,idempotency_key,reason,occurred_at,created_at) VALUES($1,$2,$3,'ADJUSTMENT',$4,$5,$6,'WORKBOOK_CORRECTION',$7,$8,$9,$10,$10)",[movementId,org,v.variant_id,-sl.quantity,sl.branch_id,sl.location_id,adjustmentId,key,reason,approvedAt]);appended.push(movementId);
      await write("INSERT INTO public.audit_logs(id,organization_id,action,entity_type,entity_id,result,source,correlation_id,metadata,occurred_at,created_at) VALUES($1,$2,'WORKBOOK_STOCK_CORRECTION','PRODUCT_VARIANT',$3,'SUCCESS','SYSTEM',$4,$5,$6,$6)",[uuid(`${manifestSha}:audit:${sl.id}`),org,v.variant_id,manifestSha,{manifestSha,delta:-sl.quantity,adjustmentId,movementId,canonicalVariantId:merge?.canonical_variant_id??null,donorVariantId:merge?.donor_variant_id??null,preservedHistory:true},approvedAt]);
    }
    for(const p of m.price_deltas)await write('INSERT INTO public.product_prices(id,organization_id,product_variant_id,branch_id,type,amount_minor,currency,valid_from,created_at,updated_at) VALUES($1,$2,$3,NULL,$4,$5,$6,$7,$7,$7)',[p.deterministic_id,org,p.variant_id,p.type,p.amount_minor,p.currency,approvedAt]);
    const after=await state();const totals={units:after.stock_levels.reduce((n,s)=>n+s.quantity,0),activeVariants:after.product_variants.filter(v=>v.is_active).length,prices:after.product_prices.length};same(totals,{units:4826,activeVariants:994,prices:1184},'final totals');
    for(const p of m.models){const row=after.products.find(r=>r.id===p.product_id);for(const f of ['name','is_rentable','is_sellable','show_on_website','publication_status'])same(row[f],p.after[f],'final model');for(const f of ['direct_is_rentable_override','direct_is_sellable_override','direct_show_on_website_override'])same(row[f],p.after[f]??null,'final DIRECT');}
    for(const g of m.groups.filter(g=>g.execution_id)){const e=after.product_executions.find(r=>r.id===g.execution_id);same([e.name,e.is_rentable_override,e.is_sellable_override,e.show_on_website_override],[g.execution_after,g.isRentableOverride,g.isSellableOverride,g.showOnWebsiteOverride],'final execution');}
    for(const p of m.price_deltas){const row=after.product_prices.find(r=>r.id===p.deterministic_id);same([row.product_variant_id,row.type,row.amount_minor,row.currency,row.branch_id,row.valid_from.toISOString()],[p.variant_id,p.type,p.amount_minor,p.currency,null,approvedAt],'final price');}
    for(const v of m.variant_targets){const row=after.product_variants.find(r=>r.id===v.variant_id);same([row.is_active,row.sku,row.size_id],[v.is_active_after,v.sku_after,v.size_id_after],'final variant');assert.equal(after.stock_levels.filter(s=>s.product_variant_id===v.variant_id).reduce((n,s)=>n+s.quantity,0),v.stock_after);}
    const newMovements=await select('inventory_movements','product_variant_id',ids);same(sha({sources:await select('catalog_source_references','product_variant_id',ids),movements:newMovements.filter(row=>!appended.includes(row.id)),items:await select('order_items','product_variant_id',ids),allocations:await select('capacity_allocations','product_variant_id',ids),commitments:await select('sale_inventory_commitments','product_variant_id',ids)}),originalHistory,'original history immutable');
    if(options.verifyPreservation) await options.verifyPreservation(client,preservationFingerprint);
    if(options.verifySchema) await options.verifySchema(client);
    const metadata={manifestSha,approvedAt,totals,originalHistory,...(preservationFingerprint ? {preservationFingerprint} : {}),afterFingerprint:sha(after),afterHistoryFingerprint:sha(await history())};
    await write("INSERT INTO public.audit_logs(id,organization_id,action,entity_type,entity_id,result,source,correlation_id,metadata,occurred_at,created_at) VALUES($1,$2::uuid,'WORKBOOK_IMPORT_COMMITTED','CATALOG',$2::uuid::text,'SUCCESS','SYSTEM',$3,$4,$5,$5)",[markerId,org,manifestSha,metadata,approvedAt]);
    if(options.beforeCommit) await options.beforeCommit();
    await client.query('COMMIT');return {replayed:false,writes,totals};
  } catch(error) { await client.query('ROLLBACK');throw error; }
}
module.exports={compileManifest,executeWorkbookTransaction,sha,uuid};
