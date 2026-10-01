// Real read services, permission resolver and XLSX routes; only DB/auth/storage are mocked.
// No env files, database clients or network clients are loaded.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), ExcelJS = require('exceljs');
const org = 'org-a', foreign = 'org-b', a = 'branch-a', b = 'branch-b';
let session, grants, overrides, active, calls, overflow, photoMode, storageCalls, pendingExists, peakExists;
function reset(role = 'DIRECTOR', scope = [a]) {
  session = { organizationId: org, membershipId: 'member', userId: 'user', role, defaultBranchId: a };
  grants = scope; overrides = []; active = true; calls = []; overflow = false;
  photoMode = 'ok'; storageCalls = []; pendingExists = 0; peakExists = 0;
}
function override(key, effect = 'DENY') { overrides.push({ permissionKey: key, effect }); }
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    const actual = row[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if ('in' in value) return value.in.includes(actual);
    if ('is' in value) return actual != null && matches(actual, value.is);
    if ('some' in value) return actual?.some(item => matches(item, value.some));
    if ('contains' in value) return String(actual).toLowerCase().includes(value.contains.toLowerCase());
    if ('gte' in value || 'lt' in value || 'lte' in value || 'gt' in value) return actual != null
      && (value.gte === undefined || actual >= value.gte) && (value.lt === undefined || actual < value.lt)
      && (value.lte === undefined || actual <= value.lte) && (value.gt === undefined || actual > value.gt);
    return actual != null && matches(actual, value);
  });
}
function project(row, select) {
  if (!select) return row;
  return Object.fromEntries(Object.entries(select).filter(([, spec]) => spec).map(([key, spec]) => {
    const value = row[key]; if (spec === true) return [key, value];
    if (Array.isArray(value)) return [key, value.filter(item => matches(item, spec.where)).map(item => project(item, spec.select))];
    return [key, value == null ? null : project(value, spec.select)];
  }));
}
const size = { id: 'size', organizationId: org, code: 'M', name: 'M', sortOrder: 1 };
const branches = [a, b].map(id => ({ id, organizationId: org, name: id, status: 'ACTIVE', timezone: 'Asia/Almaty',
  locations: [{ id: `loc-${id}`, organizationId: org, name: `loc-${id}`, isActive: true }] }));
const levels = [a, b].map((branchId, i) => ({ id: `stock-${branchId}`, organizationId: org, branchId, productVariantId: 'v-bulk', quantity: i ? 97 : 3, locationId: `loc-${branchId}` }));
const instances = [a, b].map(currentBranchId => ({ id: `instance-${currentBranchId}`, organizationId: org, currentBranchId,
  currentLocationId: `loc-${currentBranchId}`, productVariantId: 'v-serial', inventoryNumber: currentBranchId, barcode: currentBranchId, operationalStatus: 'AVAILABLE', conditionStatus: 'GOOD' }));
const prices = [null, a, b].flatMap((branchId, i) => ['v-bulk', 'v-serial'].map(productVariantId => ({ organizationId: org, branchId,
  productVariantId, amountMinor: BigInt(10 + i * 10), currency: 'KZT', type: 'RENTAL', validFrom: new Date(0), validUntil: null })));
const products = ['bulk', 'serial'].map(mode => ({ id: mode, organizationId: org, name: mode, internalCode: mode,
  publicationStatus: 'ACTIVE', archivedAt: null, trackingMode: mode === 'bulk' ? 'BULK' : 'SERIALIZED',
  categoryId: null, category: null, images: [], variants: [{ id: `v-${mode}`, productId: mode, organizationId: org, sku: mode,
    isActive: true, sizeId: size.id, executionId: null, size, execution: null,
    prices: prices.filter(row => row.productVariantId === `v-${mode}`),
    stockLevels: levels.filter(row => row.productVariantId === `v-${mode}`), instances: instances.filter(row => row.productVariantId === `v-${mode}`) }] }));
const now = new Date();
const effectKeys = ['cashEffectMinor', 'revenueEffectMinor', 'depositEffectMinor', 'obligationEffectMinor'];
const ledger = [];
for (const branchId of [a, b]) for (const kind of ['PAYMENT_RECEIVED', 'CUSTOMER_REFUND', 'RENTAL_CHARGE', 'SALE_CHARGE', 'DAMAGE_CHARGE', 'DISCOUNT', 'DEPOSIT_RECEIVED', 'DEPOSIT_REFUNDED', 'DEPOSIT_WITHHELD']) {
  const base = { id: `${branchId}-${kind}`, organizationId: org, branchId, kind, amountMinor: 11n, currency: 'KZT',
    occurredAt: now, revenueEffectMinor: kind.endsWith('CHARGE') ? 11n : 0n, cashEffectMinor: kind.includes('RECEIVED') ? 11n : 0n,
    depositEffectMinor: kind === 'DEPOSIT_RECEIVED' ? 11n : 0n, obligationEffectMinor: 11n, reason: '=synthetic',
    branch: branches.find(row => row.id === branchId), orderId: 'order', order: { orderNumber: 'SYNTHETIC' },
    paymentMethod: { displayName: 'test' }, actorUser: { displayName: 'synthetic' }, reversalOf: null };
  ledger.push(base, { ...base, id: `reversal-${base.id}`, kind: 'REVERSAL', reversalOf: base });
}
ledger.push({ ...ledger[0], id: 'foreign', organizationId: foreign }, { ...ledger[0], id: 'orphan', kind: 'REVERSAL' });
function rows(table) { return { product: products, productVariant: products.flatMap(row => row.variants), productInstance: instances,
  stockLevel: levels, productPrice: prices, branch: branches, location: branches.flatMap(row => row.locations), size: [size],
  category: [], productImage: [], productExecution: [], financialTransaction: ledger }[table]; }
const db = new Proxy({}, { get(_target, table) {
  if (table === '$transaction') return callback => callback(db);
  if (table === 'organizationMembership') return { findFirst: async ({ where, select }) => {
    if (!active || !session || where.organizationId !== org || where.id !== session.membershipId) return null;
    return project({ role: session.role, permissionOverrides: overrides, branchAccess: grants.map(branchId => ({ branchId, branch: { status: branches.find(row=>row.id===branchId)?.status ?? 'INACTIVE' } })) }, select);
  } };
  assert.ok(rows(table), `Unexpected DB model: ${String(table)}`);
  return {
    findMany: async query => { calls.push({ table, query }); assert.equal(query.where.organizationId, org);
      let found = rows(table).filter(row => matches(row, query.where));
      if (overflow && table === 'financialTransaction') found = Array(10001).fill(found[0]);
      return found.slice(query.skip ?? 0, query.take ? (query.skip ?? 0) + query.take : undefined).map(row => project(row, query.select));
    },
    findFirst: async query => { calls.push({ table, query }); assert.equal(query.where.organizationId, org);
      const found = rows(table).find(row => matches(row, query.where)); return found ? project(found, query.select) : null; },
    groupBy: async query => { calls.push({ table, query }); assert.equal(query.where.organizationId, org);
      const found = rows(table).filter(row => matches(row, query.where)); if (!found.length) return [];
      return [{ currency: 'KZT', _count: { _all: found.length }, _sum: Object.fromEntries(effectKeys.filter(key => query._sum[key]).map(key => [key, found.reduce((sum, row) => sum + row[key], 0n)])) }];
    }
  };
} });
const sources = new Set(['lib/catalog/access.ts','lib/catalog/images.ts','lib/catalog/errors.ts','lib/catalog/image-renditions.ts','lib/finance/revenue-family.ts','lib/catalog/queries.ts','lib/catalog/read-scope.ts','lib/finance/dashboard.ts','lib/finance/read-visibility.ts',
  'lib/permissions/effective.ts','lib/permissions/registry.ts','lib/staff/branch-access.ts','lib/staff/errors.ts',
  'app/finance/export/route.ts','app/products/export/route.ts']);
const stubs = { 'server-only': {}, react: { cache: fn => fn }, exceljs: ExcelJS, '@/lib/db': { db },
  '@/lib/auth/session': { getCurrentSession: async () => session }, '@/lib/tenant/context': { createTenantContext: organizationId => ({ organizationId }) },
  sharp: require('sharp'), 'node:crypto': require('node:crypto'),
  '@/lib/storage/client': { PRODUCT_IMAGES_BUCKET: 'mock', getStorageClient: () => photoMode === 'disconnected' ? null : { storage: { from: () => ({
    exists: async key => { storageCalls.push(['exists',key]); pendingExists++; peakExists = Math.max(peakExists,pendingExists); await Promise.resolve(); pendingExists--; return { data: photoMode !== 'missing', error: photoMode === 'exists-error' ? new Error('synthetic') : null }; },
    createSignedUrl: async (key,ttl) => { storageCalls.push(['sign',key,ttl]); return { data: { signedUrl: `mock:${key}` }, error: photoMode === 'all-sign-error' || photoMode === 'sign-error' && key.endsWith('.catalog.webp') ? new Error('synthetic') : null }; }
  }) } } }, '@/lib/catalog/tracking-mode': { hasProductOperationalHistory: async () => false } };
const cache = new Map();
function load(file) {
  assert.ok(sources.has(file), `Source not allowed: ${file}`); if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => { if (Object.hasOwn(stubs,name)) return stubs[name];
    const base = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.posix.join(path.posix.dirname(file),name) : null;
    assert.ok(base, `Dependency not allowed: ${name}`); return load(`${base}.ts`); };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})', { Date, console, Response, URL, Buffer }, { filename: file })(localRequire, loaded, loaded.exports);
  cache.set(file,loaded.exports); return loaded.exports;
}
const catalog = load('lib/catalog/queries.ts'), finance = load('lib/finance/dashboard.ts'), visibility = load('lib/finance/read-visibility.ts');
const financeExport = load('app/finance/export/route.ts'), catalogExport = load('app/products/export/route.ts');
const request = suffix => new Request(`http://localhost${suffix}`);
const date = now.toISOString().slice(0,10), financeUrl = `/finance/export?from=${date}&until=${date}`;
async function workbook(response) { assert.equal(response.status,200); const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await response.arrayBuffer())); return book; }
const headings = sheet => sheet.getRow(1).values.slice(1);
let passed = 0;
async function test(name, fn) { reset(); await fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
  await test('catalog list/detail/management restrict both BULK and SERIALIZED to selected branch scope', async () => {
    for (const allowedBranchIds of [[a], [b], [], null, undefined]) {
      const input = { tenant: { organizationId: org }, defaultBranchId: a, allowedBranchIds };
      const cards = await catalog.getCatalogProducts(input);
      const count = allowedBranchIds === null ? 2 : (allowedBranchIds ?? []).length;
      assert.equal(cards.find(row => row.id === 'serial').totalInstances,count);
      assert.equal(cards.find(row => row.id === 'bulk').totalStock, allowedBranchIds === null ? 100 : allowedBranchIds?.includes(a) ? 3 : allowedBranchIds?.includes(b) ? 97 : 0);
      for (const productId of ['bulk','serial']) {
        const detail = await catalog.getCatalogProductById({ ...input, productId });
        const physical = productId === 'bulk' ? detail.variants[0].stockLevels : detail.variants[0].instances;
        assert.equal(physical.length,count); assert.ok(physical.every(row => allowedBranchIds === null || allowedBranchIds.includes(row.branchName)));
        assert.equal(detail.variants[0].rentalPrice.amountMinor, allowedBranchIds === null || allowedBranchIds?.includes(a) ? 20 : 10);
      }
      const options = await catalog.getCatalogManagementOptions(input.tenant,allowedBranchIds);
      assert.equal(options.branches.length,count); assert.ok(options.branches.every(row => row.locations.every(location => location.id === `loc-${row.id}`)));
    }
  });
  await test('catalog search/category/archive/pagination filters survive scoped read', async () => {
    await catalog.getCatalogProducts({ tenant: { organizationId: org }, defaultBranchId: a, allowedBranchIds: [a], search: 'bulk', categoryId: 'category', includeArchived: true, page: 2 });
    const query = calls.find(call => call.table === 'product').query;
    assert.equal(query.where.categoryId,'category'); assert.equal(query.where.publicationStatus,undefined); assert.equal(query.skip,36); assert.equal(query.take,36);
    assert.equal(query.where.OR[0].name.contains,'bulk');
  });
  await test('catalog XLSX preserves global prices but never inaccessible default-branch price', async () => {
    session.defaultBranchId = b;
    const book = await workbook(await catalogExport.GET(request('/products/export?q=bulk')));
    assert.equal(book.worksheets[0].getRow(2).getCell(10).value,10);
    assert.equal(book.worksheets[0].rowCount,2);
    override('CATALOG_VIEW'); assert.equal((await catalogExport.GET(request('/products/export'))).status,403);
    session = null; assert.equal((await catalogExport.GET(request('/products/export'))).status,401);
  });
  await test('role defaults and explicit grants preserve authorized finance access', async () => {
    for (const role of ['OWNER','DIRECTOR','SELLER','CASHIER']) {
      reset(role); if (role === 'SELLER' || role === 'CASHIER') {
        await assert.rejects(finance.getFinanceDashboard({ organizationId: org },session));
        assert.equal((await financeExport.GET(request(financeUrl))).status,403);
        override('FINANCE_DASHBOARD_VIEW','ALLOW'); override('REPORT_FINANCE_VIEW','ALLOW'); override('PAYMENT_VIEW','ALLOW');
      }
      const data = await finance.getFinanceDashboard({ organizationId: org },session);
      assert.ok(data.recent.length > 0);
      const book = await workbook(await financeExport.GET(request(financeUrl))); assert.ok(book.worksheets[0].rowCount > 1);
      if (role === 'SELLER' || role === 'CASHIER') assert.ok(data.recent.every(row => row.kind === 'PAYMENT_RECEIVED' || row.kind === 'CUSTOMER_REFUND' || row.kind === 'REVERSAL'));
    }
  });
  await test('each finance deny removes its families, reversals, fields and XLSX columns/totals', async () => {
    for (const [permissionKey,field,header,families] of [
      ['DEPOSIT_VIEW','depositEffectMinor','Изменение залога',['DEPOSIT_RECEIVED','DEPOSIT_REFUNDED','DEPOSIT_WITHHELD']],
      ['PAYMENT_VIEW',null,null,['PAYMENT_RECEIVED','CUSTOMER_REFUND']],
      ['FINANCE_MARGIN_VIEW','revenueEffectMinor','Начислено',['RENTAL_CHARGE','SALE_CHARGE','DAMAGE_CHARGE','DISCOUNT']],
      ['CUSTOMER_BALANCE_VIEW','obligationEffectMinor','Изменение долга',[]]
    ]) {
      reset(); override(permissionKey); const policy = await visibility.financeReadVisibility(session);
      const data = await finance.getFinanceDashboard({ organizationId: org },session);
      assert.ok(data.recent.every(row => !families.some(kind => row.id.endsWith(kind))));
      if (field) { assert.equal(Object.hasOwn(data.totals[0]._sum,field),false); assert.equal(Boolean(policy.fields[field]),false); }
      assert.equal(data.recent.some(row => row.id === 'foreign' || row.id === 'orphan' || row.id.includes(b)),false);
      const book = await workbook(await financeExport.GET(request(financeUrl)));
      if (header) assert.equal(headings(book.worksheets[0]).includes(header),false);
      const exported = JSON.stringify(book.worksheets.map(sheet => sheet.getSheetValues()));
      for (const kind of families) assert.equal(exported.includes(kind),false);
      if (field === 'depositEffectMinor') assert.equal(headings(book.worksheets[1]).includes('Изменение залогов'),false);
      if (field === 'obligationEffectMinor') assert.equal(headings(book.worksheets[1]).includes('Изменение долга'),false);
      assert.equal(exported.includes('branch-b'),false);
    }
  });
  await test('no grants/empty branch scope never become organization-wide aggregates', async () => {
    reset('DIRECTOR',[]); const data = await finance.getFinanceDashboard({ organizationId: org },session);
    assert.equal(data.totals.length,0); assert.equal(data.recent.length,0);
    const book = await workbook(await financeExport.GET(request(financeUrl))); assert.equal(book.worksheets[0].rowCount,1);
    reset('CASHIER'); override('FINANCE_DASHBOARD_VIEW','ALLOW'); override('REPORT_FINANCE_VIEW','ALLOW');
    assert.equal((await finance.getFinanceDashboard({ organizationId: org },session)).hasVisibleKinds,false);
    assert.equal((await financeExport.GET(request(financeUrl))).status,403);
    assert.equal(calls.filter(call => call.table === 'financialTransaction').length,0);
  });
  await test('OWNER invariant, foreign tenant mismatch and inactive membership', async () => {
    reset('OWNER'); override('DEPOSIT_VIEW'); const data = await finance.getFinanceDashboard({ organizationId: org },session);
    assert.ok(data.recent.some(row => row.id.includes(b))); assert.ok(Object.hasOwn(data.totals[0]._sum,'depositEffectMinor'));
    await assert.rejects(finance.getFinanceDashboard({ organizationId: foreign },session));
    reset(); active = false; await assert.rejects(finance.getFinanceDashboard({ organizationId: org },session));
  });
  await test('finance export bounds, date filters, literal text and exact sums', async () => {
    assert.equal((await financeExport.GET(request('/finance/export?from=2026-02-30&until=2026-03-01'))).status,400);
    assert.equal((await financeExport.GET(request('/finance/export?from=2026-01-01'))).status,400);
    assert.equal((await financeExport.GET(request('/finance/export?from=2024-01-01&until=2026-01-01'))).status,400);
    const book = await workbook(await financeExport.GET(request(financeUrl)));
    const policy = await visibility.financeReadVisibility(session);
    const rows = ledger.filter(row => matches(row,{ organizationId: org,branchId: { in:[a] },...policy.where }));
    assert.equal(book.worksheets[1].getRow(2).getCell(2).value,rows.length);
    assert.equal(book.worksheets[1].getRow(2).getCell(3).value,Number(rows.reduce((sum,row) => sum+row.revenueEffectMinor,0n)));
    assert.equal(book.worksheets[0].getRow(2).getCell(13).value,"'=synthetic");
    const query = calls.find(call => call.table === 'financialTransaction').query;
    assert.equal(query.where.occurredAt.gte.toISOString(),`${date}T00:00:00.000Z`); assert.ok(query.where.occurredAt.lt > now);
    overflow = true; assert.equal((await financeExport.GET(request(financeUrl))).status,413);
  });
  await test('sale export subtotal uses existing charge provenance, discounts/reversals and field DENY', async () => {
    const originalLength=ledger.length;
    const sale={...ledger[0],id:'sale-export',kind:'SALE_CHARGE',sourceType:'ORDER_CHARGE',sourceId:'sale-order',orderId:'sale-order',order:{orderNumber:'S',type:'SALE'},revenueEffectMinor:1000n,cashEffectMinor:0n};
    ledger.push(sale,{...sale,id:'sale-discount',kind:'DISCOUNT',revenueEffectMinor:-100n},
      {...sale,id:'sale-reversal',kind:'REVERSAL',reversalOf:sale,revenueEffectMinor:-300n},
      {...sale,id:'ambiguous-sale',sourceId:'wrong',revenueEffectMinor:900n},
      {...sale,id:'foreign-sale',branchId:b,revenueEffectMinor:9000n});
    try {
      let book=await workbook(await financeExport.GET(request(financeUrl)));
      let totals=book.worksheets[1],column=headings(totals).indexOf('В том числе начисления продажи')+1;
      assert.ok(column>0);assert.equal(totals.getRow(2).getCell(column).value,600);
      override('FINANCE_MARGIN_VIEW');book=await workbook(await financeExport.GET(request(financeUrl)));
      assert.equal(headings(book.worksheets[1]).includes('В том числе начисления продажи'),false);
    } finally {ledger.length=originalLength;}
  });
  await test('catalog previews use real rendition helper, original fallback, no-image and tenant filter without extra DB queries', async () => {
    const input={tenant:{organizationId:org},defaultBranchId:a,allowedBranchIds:[a],page:1};
    const fixture=(key,organizationId=org)=>({id:key,organizationId,storageKey:key,status:'ACTIVE',productVariantId:null});
    try {
      products[0].images=[fixture('org-a/bulk.jpg')];
      products[1].images=[fixture('foreign/secret.jpg',foreign)];
      for(const mode of ['ok','missing','exists-error','sign-error','all-sign-error','disconnected']){
        reset();photoMode=mode;const cards=await catalog.getCatalogProducts(input);
        assert.equal(cards.find(row=>row.id==='bulk').imageUrl,mode==='disconnected'||mode==='all-sign-error'?null:mode==='ok'?'mock:org-a/bulk.jpg.catalog.webp':'mock:org-a/bulk.jpg');
        assert.equal(cards.find(row=>row.id==='serial').imageUrl,null);
        assert.equal(storageCalls.some(call=>call[1].includes('foreign')),false);
        assert.equal(calls.length,1);assert.equal(calls[0].table,'product');assert.equal(calls[0].query.take,36);
        assert.equal(storageCalls.length,mode==='disconnected'?0:mode==='sign-error'||mode==='all-sign-error'?3:2);
        assert.ok(storageCalls.filter(call=>call[0]==='sign').every(call=>call[2]===3600));
      }
      reset();products[0].images=[];products[1].images=[];await catalog.getCatalogProducts(input);assert.equal(storageCalls.length,0);
      products[0].images=[fixture('org-a/bulk.jpg')];products[1].images=[fixture('org-a/serial.jpg')];
      reset();await catalog.getCatalogProducts(input);assert.equal(calls.length,1);assert.equal(storageCalls.length,4);assert.equal(peakExists,2);
    } finally {products[0].images=[];products[1].images=[];}
  });
  await test('catalog pages and export share fresh scope for inactive branch grants and global price fallback',async()=>{
    const access=load('lib/catalog/access.ts');reset('DIRECTOR',[b]);session.defaultBranchId=b;session.allowedBranchIds=[b];
    branches[1].status='ARCHIVED';
    try{
      const scope=await access.getCatalogReadScope(session);assert.equal(scope.length,0);
      const data=await catalog.getCatalogProducts({tenant:{organizationId:org},defaultBranchId:b,allowedBranchIds:scope});
      assert.equal(data.find(row=>row.id==='bulk').totalStock,0);assert.equal(data.find(row=>row.id==='bulk').rentalPrice.amountMinor,10);
      const book=await workbook(await catalogExport.GET(request('/products/export?q=bulk')));assert.equal(book.worksheets[0].getRow(2).getCell(10).value,10);
      const options=await catalog.getCatalogManagementOptions({organizationId:org},scope);assert.equal(options.branches.length,0);
      reset('OWNER');assert.equal(await access.getCatalogReadScope(session),null);
      active=false;await assert.rejects(access.getCatalogReadScope(session));
      for(const file of ['app/products/page.tsx','app/products/[id]/page.tsx','app/products/[id]/edit/page.tsx','app/products/[id]/labels/page.tsx','app/products/new/page.tsx','app/products/settings/page.tsx']){
        const source=fs.readFileSync(file,'utf8');assert.ok(source.includes('await getCatalogReadScope(session)'));assert.equal(/session\.hasOrganizationWideBranchAccess\s*\?\s*null\s*:\s*session\.allowedBranchIds/.test(source),false);
      }
    }finally{branches[1].status='ACTIVE';}
  });
  console.log(`CRM read scope regression: ${passed}/${passed} scenarios passed; actual XLSX roundtrip, no real DB.`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
