// Real React components/CSS in a fresh local Edge profile, synthetic DTO/API only.
// Next Link/Image/router are lightweight adapters; Next routing is checked separately.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'mariposa-browser-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const mobileTargeted=process.argv.includes('--mobile-draft-only'); let failSelectionOnce=false;
const tests = [], errors = [], requests = [], pending = new Map(); let server, chrome, ws, seq = 0, origin;
async function until(fn, label) { for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(100); } throw Error('Timeout: ' + label); }
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.delete(id)) reject(Error(method + ' timeout')); }, 20000).unref(); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
async function set(selector, value) { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
async function click(text, container = 'document') { await evaluate(`(()=>{const b=[...${container}.querySelectorAll('button,a,summary')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click()})()`); }
async function navigate(route) { await evaluate(`history.pushState({},'',${JSON.stringify(route)});window.dispatchEvent(new PopStateEvent('popstate'));`); await delay(150); }
async function shot(name) { const image = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}); fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(image.data,'base64')); }
async function layout(label) { assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), label + ' page overflow'); }
(async () => { try {
  await esbuild.build({ absWorkingDir: root, entryPoints: ['scripts/showroom-browser-fixture.tsx'], outdir: out, bundle: true, jsx: 'automatic', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-local-adapters', setup(build) {
    build.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root, contents: args.path === 'next/navigation' ? `export function useRouter(){return {replace(url){history.replaceState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));},push(url){history.pushState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));}}}` : args.path === 'next/link' ? `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}` : `import React from 'react';export default function Image({unoptimized,priority,fill,...props}){return <img {...props}/>}` }));
  } }] });
  server = http.createServer((req, res) => {
    const url = new URL(req.url, origin || 'http://127.0.0.1'); requests.push({ path: url.pathname, method: req.method });
    if (url.pathname === '/api/showroom/photo') { res.setHeader('Content-Type','image/png');return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFbkAAAAASUVORK5CYII=','base64')); }
    if (url.pathname === '/api/showroom/selection') {
      if(failSelectionOnce){failSelectionOnce=false;res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Synthetic temporary failure'}));}
      const variant = url.searchParams.get('variantId');
      const data = { id: variant, name: 'Synthetic dress 2', size: variant === id(12) ? '140' : '146', execution: null, available: variant === id(12), price: variant === id(12) ? { amountMinor: '2500', currency: 'KZT' } : null };
      const wait = url.searchParams.get('from')?.endsWith('13:00') ? 700 : 20;
      return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }, wait);
    }
    if (url.pathname.startsWith('/api/')) { res.writeHead(503); return res.end('{}'); }
    const asset = url.pathname.startsWith('/brand/') || url.pathname.startsWith('/fonts/');
    const filename = url.pathname.startsWith('/fonts/') ? path.resolve(root, 'app/showroom/fonts', path.basename(url.pathname)) : asset ? path.resolve(root, 'public', '.' + url.pathname) : path.join(out, path.basename(url.pathname));
    if ((asset && (filename.startsWith(path.join(root, 'public') + path.sep) || filename.startsWith(path.join(root, 'app/showroom/fonts') + path.sep)) || !asset && /\.css$|\.js$/.test(filename)) && fs.existsSync(filename) && fs.statSync(filename).isFile()) {
      res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.ttf') ? 'font/ttf' : 'image/png'); return res.end(fs.readFileSync(filename));
    }
    if (url.pathname.endsWith('.ico')) { res.writeHead(204); return res.end(); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic local test</title><link rel="stylesheet" href="/showroom-browser-fixture.css"><style>body{margin:0}@font-face{font-family:Onest;src:url('/fonts/Onest.ttf')}@font-face{font-family:Cormorant;src:url('/fonts/CormorantGaramond.ttf')}.showroom{--font-showroom-body:Onest;--font-showroom-heading:Cormorant}</style><div id="root"></div><script src="/showroom-browser-fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  chrome = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--no-first-run', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + path.join(out, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(out, 'profile', 'DevToolsActivePort'); await until(() => fs.existsSync(portFile), 'Edge launch');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0], target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => { const r = JSON.parse(event.data); if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails.text); if (r.id && pending.has(r.id)) { const p = pending.get(r.id); pending.delete(r.id); r.error ? p.reject(Error(JSON.stringify(r.error))) : p.resolve(r.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://*.com/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/showroom' });
  await until(() => evaluate('!!document.querySelector(".site-header")'), 'React mount'); await evaluate('document.fonts.ready');
  if(!mobileTargeted){
  await layout('desktop home'); assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
  assert(await evaluate('document.querySelector(".site-brand img").naturalWidth>0'), 'approved logo loaded');
  await shot('desktop-home');
  tests.push('Desktop home, real fonts/assets and shell render without horizontal overflow');
  await navigate('/showroom?view=catalog'); await layout('desktop catalog');
  for (const [name, value] of Object.entries({ colorGroup: 'pink', size: '140', branchId: id(1), from: '2026-12-10T12:00', until: '2026-12-11T18:00' })) await set('.catalog-color-filters [name=' + name + ']', value);
  await evaluate('document.querySelector(".catalog-color-filters").requestSubmit()'); await delay(150);
  assert.equal(await evaluate('new URLSearchParams(location.search).get("size")'), '140');
  await evaluate('document.querySelector(".catalog-card-link").click()'); await until(() => evaluate('!!document.querySelector(".product-detail-ready")'), 'product');
  assert.equal(await evaluate('document.querySelector("[name=variantId]").value'), id(12));
  assert.equal(await evaluate('document.querySelector("[name=from]").value'), '2026-12-10T12:00');
  await layout('desktop product');await until(()=>evaluate('document.querySelector(".product-gallery img")?.naturalWidth>0'),'gallery photo loaded');await evaluate('document.querySelectorAll(".product-gallery-slots button")[1].click()');await until(()=>evaluate('document.querySelector(".product-gallery img").alt==="Synthetic test image 2"'),'gallery selection');
  assert(await evaluate('document.querySelector(".site-section a[href*=productId]").href.includes("from=2026-12-10")'), 'recommendations retain entry dates');
  await click('Проверить размер и даты'); await until(() => evaluate('document.querySelector(".product-detail-ready [role=status]")?.innerText.includes("Доступно")'), 'availability');
  assert(await evaluate('document.querySelector(".product-price").innerText.includes("2 500")'), 'actual synthetic price');
  await click('Запросить примерку'); await until(() => evaluate('!!document.querySelector(".inquiry-draft")'), 'fitting draft');
  assert.equal(await evaluate('document.querySelectorAll("[name=replyContact]").length'), 0);
  await set('.inquiry-draft [type=date]', '2026-12-09'); await set('.inquiry-draft [type=time]', '14:00'); await click('Посмотреть пожелания');
  assert(await evaluate('document.querySelector(".inquiry-draft [role=status]").innerText.includes("Не отправлены")'));
  await click('Вернуться к выбору'); await until(() => evaluate('!!document.querySelector("[name=variantId]")'), 'back to product');
  await set('[name=variantId]', id(22)); assert.equal(await evaluate('document.querySelector(".product-detail-ready [role=status]")===null'), true);
  await click('Проверить размер и даты'); await until(() => evaluate('document.querySelector(".product-detail-ready [role=status]")?.innerText.includes("недоступно")'), 'unavailable variant');
  assert.equal(await evaluate('document.querySelector(".product-price").innerText'), 'Уточнить стоимость');
  await set('[name=from]', '2026-12-10T13:00'); await click('Проверить размер и даты'); await click('Отменить проверку'); await delay(900);
  assert.equal(await evaluate('document.querySelector(".product-detail-ready [role=status]")===null'), true);
  tests.push('Catalog filters → exact product/size/dates; price/availability; missing price; cancellation rejects late result; fitting remains unsent draft');
  await click('♡ В избранное', 'document.querySelector(".product-detail-ready")');
  await navigate('/showroom?view=favorites'); await until(() => evaluate('!!document.querySelector(".favorites-page .showroom-product")'), 'favorites revalidation');
  assert(await evaluate('document.querySelector(".favorites-page").innerText.includes("Synthetic dress 2")'));
  await evaluate('document.querySelector(".favorite-choice input").click()'); await until(() => evaluate('!!document.querySelector(".favorite-comparison")'), 'comparison');
  tests.push('Favorites identifiers persist across navigation, revalidate and compare');
  for (const width of [390, 768]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width === 390 });
    for (const route of ['/showroom', '/showroom?view=catalog', '/showroom?view=contacts', '/showroom?view=fitting', '/showroom?view=favorites', '/showroom?view=catalog&productId='+id(2)]) { await navigate(route); await layout(width + ' ' + route); }
  }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  if(mobileTargeted){
    await navigate('/showroom?view=catalog&productId='+id(2));
    await set('[name=variantId]',id(12));await set('[name=from]','2026-12-10T12:00');await set('[name=until]','2026-12-11T18:00');
    failSelectionOnce=true;await click('Проверить размер и даты');await until(()=>evaluate('document.querySelector("[role=alert]")?.innerText.includes("Synthetic temporary failure")'),'mobile failure');
    assert.equal(await evaluate('!!document.querySelector(".inquiry-draft")'),false);
    await click('Проверить размер и даты');await until(()=>evaluate('document.querySelector(".product-detail-ready [role=status]")?.innerText.includes("Доступно")'),'mobile retry');
    await click('Запросить примерку');await until(()=>evaluate('!!document.querySelector(".inquiry-draft")'),'mobile draft');
    await set('.inquiry-draft [type=date]','2026-12-09');await set('.inquiry-draft [type=time]','14:00');
    await click('Посмотреть пожелания');await click('Посмотреть пожелания');
    assert(await evaluate('document.querySelector(".inquiry-draft [role=status]").innerText.includes("Не отправлены")'));
    assert.equal(await evaluate('document.querySelectorAll("[name=replyContact]").length'),0);
    assert(await evaluate('[...document.querySelectorAll(".inquiry-draft button")].some(b=>b.disabled&&b.textContent.includes("Отправка"))'));
    await click('Вернуться к выбору');await until(()=>evaluate('!!document.querySelector("[name=variantId]")'),'mobile back to selection');
    assert.equal(await evaluate('document.querySelector("[name=variantId]").value'),id(12));
    await click('Запросить примерку');await until(()=>evaluate('!!document.querySelector(".inquiry-draft")'),'mobile repeated draft');
    assert.equal(await evaluate('document.querySelector(".inquiry-draft [type=time]").value'),'14:00');
    await click('Связаться с шоурумом');await until(()=>evaluate('!!document.querySelector(".contacts-page")'),'mobile contacts');
    await evaluate('history.back()');await until(()=>evaluate('!!document.querySelector(".product-detail-ready")'),'mobile browser back');
    assert.equal(await evaluate('document.querySelector("[name=variantId]").value'),id(12));await layout('mobile draft retry and back');
    tests.push('390px selection 503 -> retry -> unsent draft; repeated review, disabled submission, back/reopen retains wishes, browser back retains selection; no contact or POST');
  }else{
  await navigate('/showroom'); await shot('mobile-home'); await evaluate('document.querySelector(".site-mobile-menu summary").focus();document.querySelector(".site-mobile-menu summary").click()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.equal(await evaluate('document.querySelector(".site-mobile-menu").open'), false);
  assert.equal(await evaluate('document.activeElement.tagName'), 'SUMMARY');
  await click('Подобрать платье'); await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'helper dialog'); await layout('mobile helper');
  tests.push('390px/768px shell, catalog, contacts, fitting, favorites; mobile menu Escape restores focus; helper opens');
  }
  assert.equal(requests.filter(r => r.method === 'POST').length, 0, 'no writes'); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', tests, output: out, syntheticOnly: true, actualNextRouting: false, postRequests: 0 }, null, 2));
} catch (error) { console.error(error.stack); console.error(JSON.stringify({ tests, errors, output: out })); process.exitCode = 1; }
finally { if (ws?.readyState === 1) { try { await send('Browser.close'); } catch {} ws.close(); } if (chrome && !chrome.killed) chrome.kill(); if (server) server.close(); } })();
