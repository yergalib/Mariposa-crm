const assert=require('node:assert/strict'),Module=require('module');const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
let available=true,amount=10000,reads=0;
const load=Module._load;Module._load=function(k,...a){if(k==='@/lib/availability/capacity')return {getVariantAvailabilityWithClient:async(tx,input)=>{reads++;assert.equal(input.tenant.organizationId,f.id(1));assert.equal(input.branchId,f.branch);assert.equal(input.requestedFrom.toISOString(),'2026-10-23T10:00:00.000Z');assert.equal(input.requestedUntil.toISOString(),'2026-10-24T07:00:00.000Z');return {canFulfill:available}}};return load.call(this,k,...a)};
const {channelRentalQuote}=require('../lib/inquiries/channel-rental-quote.ts');
const tx={branch:{findFirst:async q=>q.where.id===f.branch&&q.where.organizationId===f.id(1)?{name:'Astana',timezone:'Asia/Almaty'}:null},productVariant:{findMany:async q=>{assert.ok(JSON.stringify(q.where).includes(f.id(1)));assert.equal(q.where.AND[0].product.isRentable,true);assert.equal(q.where.AND[0].product.showOnWebsite,true);return q.where.AND[1].id.in[0]===f.id(20)?[{id:f.id(20),sku:'Y140',product:{name:'Yellow'},execution:{name:'Yellow'},size:{name:'140',code:'140'},prices:[{amountMinor:BigInt(amount),currency:'KZT',branchId:f.branch}]}]:[]}}};
(async()=>{
 const scope={organizationId:f.id(1),branchId:f.branch},draft={purpose:'selection',contact:'fixture@example.invalid',variantIds:[f.id(20)],from:'2026-10-23',until:'2026-10-24'};
 const first=await channelRentalQuote(tx,scope,draft);assert.equal(first.items[0].price.amountMinor,'10000');assert.equal(first.items[0].available,true);
 amount=20000;assert.notEqual((await channelRentalQuote(tx,scope,draft)).fingerprint,first.fingerprint);amount=10000;available=false;
 const unavailable=await channelRentalQuote(tx,scope,draft);assert.notEqual(unavailable.fingerprint,first.fingerprint);assert.equal(unavailable.items[0].available,false);assert.ok(unavailable.summary.join(' ').includes('недоступно'));
 await assert.rejects(channelRentalQuote(tx,scope,{...draft,variantIds:[f.id(99)]}),/ITEM_UNAVAILABLE/);
 await assert.rejects(channelRentalQuote(tx,{...scope,branchId:f.id(99)},draft),/BRANCH_UNAVAILABLE/);
 await assert.rejects(channelRentalQuote(tx,scope,{...draft,contact:'nonsense'}),/CONTACT_REQUIRED/);
 const before=reads,exception=await channelRentalQuote(tx,scope,{...draft,purpose:'exception',variantIds:[],from:null,until:null});assert.equal(exception.period,null);assert.equal(exception.items.length,0);assert.equal(reads,before);
 console.log('PASS actual shared rental quote: date-only Astana 15:00→next12:00, publication/tenant predicates, branch price, capacity port, changed price/availability fingerprint, missing item/contact/branch, exception without fabricated reservation. Stock/database ports synthetic.');
})().catch(e=>{console.error(e);process.exitCode=1});

