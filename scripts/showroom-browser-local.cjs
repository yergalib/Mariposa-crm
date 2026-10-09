// Real React components/CSS in a fresh local Edge profile, synthetic DTO/API only.
// Next Link/Image/router are lightweight adapters; Next routing is checked separately.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'mariposa-browser-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const widgetsTargeted=process.argv.includes('--widgets-only');
const heroTargeted=process.argv.includes('--hero-only');
const editorialTargeted=process.argv.includes('--editorial-only');
const catalogDetailTargeted=process.argv.includes('--catalog-detail-only');
const benefitTargeted=process.argv.includes('--benefit-only');
const periodTargeted=process.argv.includes('--period-only');
const mobileTargeted=process.argv.includes('--mobile-draft-only'); let failSelectionOnce=false;
const tests = [], errors = [], requests = [], pending = new Map(); let server, chrome, ws, seq = 0, origin;
async function until(fn, label) { for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(100); } throw Error('Timeout: ' + label); }
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.delete(id)) reject(Error(method + ' timeout')); }, 20000).unref(); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
async function set(selector, value) {
  const period=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e?.type!=='hidden'||!['from','until'].includes(e.name))return null;const root=e.closest('.rental-date-range');return root?{from:root.querySelector('[name=from]').value,until:root.querySelector('[name=until]').value,name:e.name}:null})()`);
  if(period){period[period.name]=value;await choosePeriod(period.from,period.until);return;}
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function day(value){
  const date=value.slice(0,10);
  for(let i=0;i<24;i++){
    if(await evaluate(`!!document.querySelector('.rental-picker-dialog[open] [data-day="${date}"] button')`)){await evaluate(`document.querySelector('.rental-picker-dialog[open] [data-day="${date}"] button').click()`);return;}
    const month=await evaluate('document.querySelector(".rental-picker-dialog[open] [data-day]:not(.rdp-outside)").getAttribute("data-day")');
    await evaluate(`document.querySelector('.rental-picker-dialog[open] .rdp-button_${date<month?'previous':'next'}').click()`);await delay(20);
  }throw Error('Calendar date not reachable: '+date);
}
async function choosePeriod(from,endValue){
  await evaluate('document.querySelector(".rental-period-trigger").click()');await until(()=>evaluate('!!document.querySelector(".rental-picker-dialog[open]")'),'date picker');await click('Очистить даты');
  if(!from)return;
  await evaluate('document.querySelector(".rental-period-trigger").click()');await day(from);if(endValue)await day(endValue);
  await set('.rental-picker-dialog[open] [aria-label="Время получения"]',from.slice(11,16));if(endValue)await set('.rental-picker-dialog[open] [aria-label="Время возврата"]',endValue.slice(11,16));await click('Применить даты');
}
async function click(text, container = 'document') { if(text==='Выбрать период в календаре'){await evaluate('document.querySelector(".rental-period-trigger").click()');return;}await evaluate(`(()=>{const b=[...${container}.querySelectorAll('button,a,summary')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.focus();b.click()})()`); }
async function navigate(route) { await evaluate(`history.pushState({},'',${JSON.stringify(route)});window.dispatchEvent(new PopStateEvent('popstate'));`); await delay(150); }
async function shot(name) { const image = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}); fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(image.data,'base64')); }
async function layout(label) { assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), label + ' page overflow'); }
(async () => { try {
  await esbuild.build({ absWorkingDir: root, entryPoints: ['scripts/showroom-browser-fixture.tsx'], outdir: out, bundle: true, jsx: 'automatic', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-local-adapters', setup(build) {
    build.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: root, contents: args.path === 'next/navigation' ? `export function useRouter(){return {refresh(){window.dispatchEvent(new CustomEvent('fixture-refresh'));},replace(url){history.replaceState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));},push(url){history.pushState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));}}}` : args.path === 'next/link' ? `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}` : `import React from 'react';export default function Image({unoptimized,priority,fill,...props}){return <img {...props}/>}` }));
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
      res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.ttf') ? 'font/ttf' : filename.endsWith('.webp') ? 'image/webp' : 'image/png'); return res.end(fs.readFileSync(filename));
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
  await send('Page.navigate', { url: origin + '/showroom' + (editorialTargeted || catalogDetailTargeted || periodTargeted ? '?fixture=editorial' : '') });
  await until(() => evaluate('!!document.querySelector(".site-header")'), 'React mount'); await evaluate('document.fonts.ready');
  if(periodTargeted){
    const measurements=[];
    await send('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'});
    for(const width of [390,430,1440]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});
      await navigate('/showroom?view=catalog');await evaluate('document.querySelector(".catalog-controls > summary").click()');
      assert.equal(await evaluate('document.querySelectorAll(".rental-date-range input[type=datetime-local]").length'),0);
      await click('Выбрать период в календаре');assert(await evaluate('[...document.querySelectorAll(".rental-picker-dialog[open] input[type=time]")].every(e=>e.value==="")'),'no invented default time');
      assert(await evaluate('[...document.querySelectorAll(".rental-picker-dialog[open] button")].find(e=>e.textContent==="Применить даты").disabled'));
      await click('Отмена');await choosePeriod('2026-12-10T14:30','2026-12-12T18:00');
      assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=until]").value'),'2026-12-12T18:00');
      await evaluate('document.querySelector(".rental-period-trigger").scrollIntoView({block:"center"})');await shot('period-'+width+'-summary');
      await click('Выбрать период в календаре');await layout('compact picker '+width);
      const m=await evaluate('(()=>{const d=document.querySelector(".rental-picker-dialog[open]"),table=d.querySelector("table"),cells=[...d.querySelectorAll("td")],button=d.querySelector(".rdp-day_button");return {dialogWidth:d.getBoundingClientRect().width,dialogHeight:d.getBoundingClientRect().height,tableWidth:table.getBoundingClientRect().width,columns:d.querySelectorAll("thead th").length,maxCellWidth:Math.max(...cells.map(e=>e.getBoundingClientRect().width)),maxCellHeight:Math.max(...cells.map(e=>e.getBoundingClientRect().height)),buttonHeight:button.getBoundingClientRect().height,overflow:d.scrollWidth>d.clientWidth}})()');
      assert.equal(m.columns,7);assert(m.maxCellWidth<=45&&m.maxCellHeight<=45,'bounded cells '+JSON.stringify(m));assert(m.tableWidth<=309);assert(m.dialogHeight<=876&&!m.overflow);measurements.push({width,...m});
      await shot('period-'+width+'-calendar');
      await day('2026-12-15');await set('.rental-picker-dialog[open] [aria-label="Время получения"]','09:45');await click('Отмена');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');
      await click('Выбрать период в календаре');assert.equal(await evaluate(`document.querySelector('.rental-picker-dialog[open] [aria-label="Время получения"]').value`),'14:30');
      await evaluate('document.querySelector(".rental-picker-dialog[open] .rdp-day_button").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});assert(await evaluate('document.activeElement.classList.contains("rdp-day_button")'));
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await until(()=>evaluate('!document.querySelector(".rental-picker-dialog[open]")'),'Escape closes');assert(await evaluate('document.activeElement.classList.contains("rental-period-trigger")'));
      await click('Выбрать период в календаре');await click('Очистить даты');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=until]").value'),'');
      await choosePeriod('2026-12-10T14:30','');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=until]").value'),'');await click('Выбрать период в календаре');await day('2026-12-12');await set('.rental-picker-dialog[open] [aria-label="Время возврата"]','18:00');await click('Применить даты');
      await set('.catalog-color-filters [name=branchId]',id(1));await set('.catalog-color-filters [name=size]','24 (каз.)');await evaluate('document.querySelector(".catalog-color-filters").requestSubmit()');await delay(150);
      assert.equal(await evaluate('new URLSearchParams(location.search).get("from")'),'2026-12-10T14:30');await evaluate('document.querySelector(".catalog-size-link").click()');await until(()=>evaluate('!!document.querySelector(".product-detail-ready")'),'product period');
      assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');assert.equal(await evaluate('document.querySelector("[name=variantId]").value'),id(200));
      await click('Проверить размер и даты');await until(()=>evaluate('!!document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")'),'availability result');
      await click('Выбрать период в календаре');await set('.rental-picker-dialog[open] [aria-label="Время получения"]','15:00');await click('Отмена');assert(await evaluate('!!document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")'),'cancel retains valid check');
      await click('Выбрать период в календаре');await set('.rental-picker-dialog[open] [aria-label="Время получения"]','15:00');await click('Применить даты');assert.equal(await evaluate('!!document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")'),false,'apply invalidates availability');
      await click('Выбрать период в календаре');await shot('period-'+width+'-product-calendar');await click('Отмена');
      await navigate('/showroom?view=contacts');await evaluate('history.back()');await until(()=>evaluate('!!document.querySelector(".product-detail-ready")'),'Back restores product');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30','URL entry remains authoritative on Back');
    }
    assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method==='POST').length,0);fs.writeFileSync(path.join(out,'period-measurements.json'),JSON.stringify(measurements,null,2));console.log(JSON.stringify({status:'PASS',output:out,measurements,allRootStylesLoaded:true,postRequests:0},null,2));return;
  }
  if(benefitTargeted){
    const measurements=[];
    for(const width of [390,430,1440,1920]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await evaluate('document.fonts.ready');await layout('rental benefit '+width);
      const m=await evaluate('(()=>{const e=document.querySelector(".site-benefits"),r=e.getBoundingClientRect();return {height:r.height,title:e.querySelector("h2").textContent,text:e.querySelector("p").textContent,articles:e.querySelectorAll("article").length,steps:document.querySelectorAll("#rental li").length}})()');
      assert.equal(m.title,'Праздничный образ без покупки');assert.equal(m.text,'Подберите платье, обувь и аксессуары в одном месте. После праздника верните наряд');assert.equal(m.articles,0);assert.equal(m.steps,4);assert(m.height<=(width<700?186.1:71),'no height increase: '+JSON.stringify({width,...m}));
      await evaluate('document.querySelector(".site-benefits").scrollIntoView()');await shot('benefit-'+width);measurements.push({width,...m});
    }
    assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method==='POST').length,0);fs.writeFileSync(path.join(out,'benefit-measurements.json'),JSON.stringify(measurements,null,2));console.log(JSON.stringify({status:'PASS',output:out,measurements,postRequests:0},null,2));return;
  }
  if(catalogDetailTargeted){
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    async function full(name,width){await evaluate('window.scrollTo(0,0)');const size=(await send('Page.getLayoutMetrics')).cssContentSize;const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:size.height,scale:1}});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(png.data,'base64'));}
    for(const width of [390,430,1440,1920]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:width<700?844:1000,deviceScaleFactor:1,mobile:width<700});
      await navigate('/showroom?view=catalog');await until(()=>evaluate('[...document.images].every(i=>i.complete)'),'catalog photos');await layout('compact catalogue '+width);
      assert.equal(await evaluate('document.querySelectorAll(".catalog-product-card .catalog-size-link").length'),6);
      assert.equal(await evaluate('document.querySelectorAll(".catalog-card-sizes").length'),0);
      assert(await evaluate('[...document.querySelectorAll(".catalog-product-card")].every(e=>!e.textContent.includes("(каз.)")&&!e.textContent.includes("В избранное"))'));
      assert(await evaluate('[...document.querySelectorAll(".catalog-product-card .favorite-icon button")].every(e=>e.offsetWidth>=44&&e.offsetHeight>=44)'));
      await evaluate('document.querySelector(".catalog-product-card .favorite-icon button").click()');await until(()=>evaluate('document.querySelector(".catalog-product-card .favorite-icon button").getAttribute("aria-pressed")==="true"'),'catalog heart');assert.equal(await evaluate('new URLSearchParams(location.search).get("productId")'),null);await evaluate('document.querySelector(".catalog-product-card .favorite-icon button").click()');
      await full('catalog-detail-'+width+'-catalog-full',width);
      await evaluate('document.querySelector(".catalog-controls > summary").click()');
      await set('.catalog-color-filters [name=branchId]',id(1));await set('.catalog-color-filters [name=size]','24 (каз.)');await set('.catalog-color-filters [name=from]','2026-12-10T14:30');await set('.catalog-color-filters [name=until]','2026-12-12T18:00');
      await click('Выбрать период в календаре');await until(()=>evaluate('!!document.querySelector(\'[data-day="2026-12-10"] button\')'),'open calendar');await layout('open filters/calendar '+width);
      assert(await evaluate('(()=>{const r=document.querySelector(".rental-calendar").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'));
      await full('catalog-detail-'+width+'-filters-calendar-full',width);await evaluate('document.querySelector(".rental-calendar").scrollIntoView()');await shot('catalog-detail-'+width+'-calendar-viewport');await click('Отмена');
      assert.equal(await evaluate('document.querySelector(".catalog-color-filters [name=from]").value'),'2026-12-10T14:30');
      await evaluate('document.querySelector(".catalog-color-filters").requestSubmit()');await delay(150);await evaluate('document.querySelector(".catalog-size-link").click()');await until(()=>evaluate('!!document.querySelector(".product-detail-ready")'),'size link');
      assert.equal(await evaluate('document.querySelector("[name=variantId]").value'),id(200));assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');
      assert.equal(await evaluate('document.querySelectorAll(".product-gallery-slots button").length'),2);
      await evaluate('document.querySelectorAll(".product-gallery-slots button")[1].click()');await until(()=>evaluate('document.querySelector(".gallery-position").textContent.includes("2 из 2")'),'gallery second frame');
      await until(()=>evaluate('[...document.querySelectorAll(".product-gallery img")].every(i=>i.complete&&i.naturalWidth>0)'),'gallery real photos');await layout('multiframe gallery '+width);
      await full('catalog-detail-'+width+'-gallery-second-full',width);await evaluate('document.querySelector(".product-gallery-viewport").scrollIntoView()');await shot('catalog-detail-'+width+'-gallery-second-viewport');
      await evaluate('document.querySelector(".product-gallery-viewport").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});await until(()=>evaluate('document.querySelector(".gallery-position").textContent.includes("1 из 2")'),'gallery previous keyboard');
    }
    assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method==='POST').length,0);console.log(JSON.stringify({status:'PASS',output:out,widths:[390,430,1440,1920],states:['compact catalog and heart','open filters/calendar with dates','second real-image gallery frame'],syntheticProductAssociations:true,postRequests:0},null,2));return;
  }
  if(editorialTargeted){
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const measurements=[];
    for(const width of [390,430,1440,1920]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:width<700?844:1000,deviceScaleFactor:1,mobile:width<700});
      for(const [label,route] of [['home','/showroom'],['catalog','/showroom?view=catalog'],['product','/showroom?view=catalog&productId='+id(2)]]){
        await navigate(route);await evaluate('window.scrollTo(0,0)');await evaluate('document.fonts.ready');
        await until(()=>evaluate('[...document.images].every(i=>i.complete)'),width+' '+label+' images');await delay(200);
        await layout(width+' '+label);
        const metrics=await evaluate(`(()=>{const box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};return {hero:box('.site-hero'),photo:box('.hero-carousel-stage'),copy:box('.site-hero-copy'),benefits:box('.site-benefits'),header:box('.site-header'),card:box('.home-product-card'),height:document.documentElement.scrollHeight}})()`);
        measurements.push({width,label,...metrics});
        if(label==='home'){
          assert.equal(await evaluate('document.querySelectorAll(".home-product-card").length'),4);
          assert.equal(await evaluate('document.querySelectorAll(".home-product-card p").length'),0);
          assert.equal(await evaluate('document.querySelectorAll(".home-product-card .showroom-photo:not(.showroom-photo-with-image)").length'),0);
          assert(await evaluate('[...document.querySelectorAll(".home-product-card h3")].every(e=>e.offsetHeight<=parseFloat(getComputedStyle(e).lineHeight)*2+1)'));
          assert(await evaluate('[...document.querySelectorAll(".favorite-icon button")].every(e=>e.offsetWidth>=44&&e.offsetHeight>=44)'));
          assert(metrics.benefits.height<260,'compact benefits');
          assert(metrics.header.height<=90,'bounded header');
          if(width>700){assert(metrics.hero.width<=1281);assert(metrics.photo.width/metrics.hero.width>.56);assert(metrics.photo.x-(metrics.copy.x+metrics.copy.width)<=33);}
          else {assert(metrics.card.width>=170&&metrics.card.width<=194);assert(metrics.photo.height<=440);}
          await shot('editorial-'+width+'-home-viewport');
        }
        const size=(await send('Page.getLayoutMetrics')).cssContentSize;
        const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:size.height,scale:1}});
        fs.writeFileSync(path.join(out,'editorial-'+width+'-'+label+'-full.png'),Buffer.from(png.data,'base64'));
      }
    }
    await navigate('/showroom');await evaluate('document.querySelector(".favorite-icon button").click()');
    await until(()=>evaluate('document.querySelector(".favorite-icon button").getAttribute("aria-pressed")==="true"'),'heart persisted');
    assert(await evaluate('location.search===""'),'heart does not navigate');
    await navigate('/showroom?view=catalog');await navigate('/showroom');assert.equal(await evaluate('document.querySelector(".favorite-icon button").getAttribute("aria-pressed")'),'true');
    await evaluate('document.querySelector(".home-product-card img").dispatchEvent(new Event("error"))');await until(()=>evaluate('!!document.querySelector(".home-product-card .showroom-photo:not(.showroom-photo-with-image)")'),'broken photo fallback');await layout('broken image fallback');
    await navigate('/showroom?fixtureEmpty=1');assert.equal(await evaluate('document.querySelectorAll(".home-product-card").length'),0);assert(await evaluate('document.querySelector(".showroom-home").textContent.includes("Фотографии готовятся")'));
    assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'editorial-measurements.json'),JSON.stringify(measurements,null,2));
    console.log(JSON.stringify({status:'PASS',output:out,widths:[390,430,1440,1920],routes:['home','catalog','product'],fullPageScreenshots:12,realOwnerEditorialPhotos:true,syntheticProductAssociations:true,longNames:true,twelveSizes:true,partialPhotos:true,postRequests:0},null,2));return;
  }
  if(widgetsTargeted){
    assert.equal(await evaluate('document.querySelectorAll(".site-color-swatch").length'),0);
    assert(await evaluate('document.querySelector(".site-color-photos a").href.includes("colorGroup=pink")'));
    await evaluate('document.querySelector(".site-color-photos a").click()');await until(()=>evaluate('!!document.querySelector(".catalog-color-filters")'),'color filter');assert.equal(await evaluate('new URLSearchParams(location.search).get("colorGroup")'),'pink');await evaluate('document.querySelector(".catalog-controls > summary").click()');
    await send('Emulation.setTimezoneOverride',{timezoneId:'America/Los_Angeles'});
    await set('.catalog-color-filters [name=branchId]',id(1));await set('.rental-date-range [name=from]','2026-12-10T14:30');await set('.rental-date-range [name=until]','2026-12-11T18:00');
    await click('Выбрать период в календаре');await until(()=>evaluate(`!!document.querySelector('[data-day="2026-12-15"] button')`),'December calendar');
    await evaluate(`document.querySelector('[data-day="2026-12-15"] button').click()`);await click('Отмена');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=until]").value'),'2026-12-11T18:00');
    await click('Выбрать период в календаре');await click('Очистить даты');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'');
    await set('.rental-date-range [name=from]','2026-12-10T14:30');await click('Выбрать период в календаре');await until(()=>evaluate(`!!document.querySelector('[data-day="2026-12-12"] button')`),'partial range');
    await evaluate(`document.querySelector('[data-day="2026-12-12"] button').click()`);await set('.rental-picker-dialog[open] [aria-label="Время возврата"]','12:00');await click('Применить даты');
    assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=until]").value'),'2026-12-12T12:00');
    await click('Выбрать период в календаре');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.equal(await evaluate('document.querySelector(".rental-picker-dialog").open'),false);assert.equal(await evaluate('document.activeElement.tagName'),'BUTTON');
    await click('Выбрать период в календаре');await evaluate(`document.querySelector('[data-day="2026-12-10"] button').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});assert.equal(await evaluate('document.activeElement.closest("[data-day]")?.getAttribute("data-day")'),'2026-12-11');await layout('desktop DayPicker');await shot('widgets-calendar-desktop');await click('Отмена');await set('.catalog-color-filters [name=size]','140');await evaluate('document.querySelector(".catalog-color-filters").requestSubmit()');await delay(150);
    await evaluate('document.querySelector(".catalog-card-link").click()');await until(()=>evaluate('!!document.querySelector(".product-detail-ready")'),'dated product');assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');assert.equal(await evaluate('document.querySelector("[name=variantId]").value'),id(12));
    await click('Проверить размер и даты');await until(()=>evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")?.textContent.includes("Доступно")'),'before branch change');await set('[name=branchId]',id(6));assert.equal(await evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")'),null);assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'),'2026-12-10T14:30');await set('[name=variantId]',id(22));assert.equal(await evaluate('document.querySelector(".rental-date-range [name=until]").value'),'2026-12-12T12:00');await set('[name=branchId]',id(1));await set('[name=variantId]',id(12));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('Выбрать период в календаре');await layout('mobile DayPicker');await evaluate('document.querySelector(".rental-calendar").scrollIntoView()');await shot('widgets-calendar-mobile');await click('Отмена');
    await evaluate('document.querySelector(".product-gallery-viewport").scrollIntoView()');await delay(200);const box=await evaluate('(()=>{const r=document.querySelector(".product-gallery-viewport").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
    const y=Math.max(10,box.y+Math.min(box.height/2,250));await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.85,y}]});for(let i=1;i<=8;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.85-.7*i/8),y}]});await delay(20);}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until(()=>evaluate('document.querySelector(".gallery-position").textContent.includes("2 из 2")'),'Embla touch swipe');
    await evaluate('document.querySelector(".product-gallery-viewport").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});await until(()=>evaluate('document.querySelector(".gallery-position").textContent.includes("1 из 2")'),'gallery keyboard');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await evaluate('document.querySelectorAll(".product-gallery-slots button")[1].click()');await until(()=>evaluate('document.querySelector(".gallery-position").textContent.includes("2 из 2")'),'reduced motion gallery');await layout('mobile Embla');await shot('widgets-gallery-mobile');
    assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method==='POST').length,0);console.log(JSON.stringify({status:'PASS',tests:['CRM-color photo link; DayPicker range/apply/cancel/clear/reopen/Escape focus, civil date preserved in foreign browser timezone; URL to exact product/size; mobile calendar layout; Embla touch/keyboard/reduced motion'],output:out,syntheticOnly:true,postRequests:0},null,2));return;
  }
  if(heroTargeted){
    await until(()=>evaluate('[...document.querySelectorAll(".hero-carousel img")].every(i=>i.complete&&i.naturalWidth>0)'), 'hero images');
    assert.equal(await evaluate('document.querySelectorAll(".hero-carousel-slide").length'),3);
    assert(await evaluate('[...document.querySelectorAll(".hero-carousel img")].every(i=>i.currentSrc.endsWith("-desktop.webp"))'));
    await evaluate('window.heroShifts=0;window.heroObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput&&e.sources?.some(s=>s.node?.closest?.(".hero-carousel")))window.heroShifts+=e.value});window.heroObserver.observe({type:"layout-shift",buffered:true})');
    const desktopBox=await evaluate('document.querySelector(".hero-carousel-stage").getBoundingClientRect().height');
    const first=await evaluate('document.querySelector(".hero-carousel-slide.is-current img").src');
    await until(async()=>await evaluate('document.querySelector(".hero-carousel-slide.is-current img").src')!==first,'3-second autoplay');
    assert.equal(await evaluate('document.querySelector(".hero-carousel-stage").getBoundingClientRect().height'),desktopBox);
    await click('Пауза');const paused=await evaluate('document.querySelector(".hero-carousel-slide.is-current img").src');await delay(3200);assert.equal(await evaluate('document.querySelector(".hero-carousel-slide.is-current img").src'),paused);
    for(let i=1;i<=3;i++){await evaluate('document.querySelectorAll(".hero-carousel-dots button")['+(i-1)+'].click()');await delay(650);await shot('hero-desktop-'+i);await layout('desktop hero '+i);}
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await until(()=>evaluate('[...document.querySelectorAll(".hero-carousel img")].every(i=>i.complete&&i.naturalWidth>0&&i.currentSrc.endsWith("-mobile.webp"))'),'mobile art direction');
    await evaluate('document.querySelector(".hero-carousel").scrollIntoView()');const mobileBox=await evaluate('document.querySelector(".hero-carousel-stage").getBoundingClientRect().height');
    for(let i=1;i<=3;i++){await evaluate('document.querySelectorAll(".hero-carousel-dots button")['+(i-1)+'].click()');await delay(650);await shot('hero-mobile-'+i);await layout('mobile hero '+i);assert.equal(await evaluate('document.querySelector(".hero-carousel-stage").getBoundingClientRect().height'),mobileBox);}
    assert.equal(await evaluate('window.heroShifts'),0,'hero-induced layout shift');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await until(()=>evaluate('document.querySelector(".hero-carousel-motion-note")?.textContent.includes("отключена")'),'reduced motion');
    const reducedSlide=await evaluate('document.querySelector(".hero-carousel-slide.is-current img").src');await delay(3200);assert.equal(await evaluate('document.querySelector(".hero-carousel-slide.is-current img").src'),reducedSlide);
    assert(await evaluate('[...document.querySelectorAll(".hero-carousel-dots button")].every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44)'));
    assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method==='POST').length,0);
    console.log(JSON.stringify({status:'PASS',tests:['Three real Drive-derived hero images; correct desktop/mobile assets; 3s autoplay, pause and reduced motion; stable stage with zero observed hero CLS; 44px controls; no overflow'],output:out,syntheticCatalog:true,realHeroPhotos:true,postRequests:0},null,2));return;
  }
  if(!mobileTargeted){
  await layout('desktop home'); assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
  assert(await evaluate('document.querySelector(".site-brand img").naturalWidth>0'), 'approved logo loaded');
  await shot('desktop-home');
  tests.push('Desktop home, real fonts/assets and shell render without horizontal overflow');
  await navigate('/showroom?view=catalog'); await layout('desktop catalog');await evaluate('document.querySelector(".catalog-controls > summary").click()');
  for (const [name, value] of Object.entries({ colorGroup: 'pink', size: '140', branchId: id(1), from: '2026-12-10T12:00', until: '2026-12-11T18:00' })) await set('.catalog-color-filters [name=' + name + ']', value);
  await evaluate('document.querySelector(".catalog-color-filters").requestSubmit()'); await delay(150);
  assert.equal(await evaluate('new URLSearchParams(location.search).get("size")'), '140');assert(await evaluate('document.querySelector(".catalog-more").textContent.includes("KZT")'),'catalog rental price');
  await evaluate('document.querySelector(".catalog-card-link").click()'); await until(() => evaluate('!!document.querySelector(".product-detail-ready")'), 'product');
  assert.equal(await evaluate('document.querySelector("[name=variantId]").value'), id(12));
  assert.equal(await evaluate('document.querySelector(".rental-date-range [name=from]").value'), '2026-12-10T12:00');
  await layout('desktop product');await until(()=>evaluate('document.querySelector(".product-gallery img")?.naturalWidth>0'),'gallery photo loaded');await evaluate('document.querySelectorAll(".product-gallery-slots button")[1].click()');await until(()=>evaluate('document.querySelector(".product-gallery-slide[aria-hidden=false] img").alt==="Synthetic test image 2"'),'gallery selection');
  assert(await evaluate('document.querySelector(".site-section a[href*=productId]").href.includes("from=2026-12-10")'), 'recommendations retain entry dates');
  await click('Проверить размер и даты'); await until(() => evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")?.innerText.includes("Доступно")'), 'availability');
  assert(await evaluate('document.querySelector(".product-price").innerText.includes("2 500")'), 'actual synthetic price');
  await click('Запросить примерку'); await until(() => evaluate('!!document.querySelector(".inquiry-draft")'), 'fitting draft');
  assert.equal(await evaluate('document.querySelectorAll("[name=replyContact]").length'), 0);
  await set('.inquiry-draft [type=date]', '2026-12-09'); await set('.inquiry-draft [type=time]', '14:00'); await click('Посмотреть пожелания');
  assert(await evaluate('document.querySelector(".inquiry-draft [role=status]").innerText.includes("Не отправлены")'));
  await click('Вернуться к выбору'); await until(() => evaluate('!!document.querySelector("[name=variantId]")'), 'back to product');
  await set('[name=variantId]', id(22)); assert.equal(await evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")===null'), true);
  await click('Проверить размер и даты'); await until(() => evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")?.innerText.includes("недоступно")'), 'unavailable variant');
  assert.equal(await evaluate('document.querySelector(".product-price").innerText'), 'Уточнить стоимость');
  await set('.rental-date-range [name=from]', '2026-12-10T13:00'); await click('Проверить размер и даты'); await click('Отменить проверку'); await delay(900);
  assert.equal(await evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")===null'), true);
  tests.push('Catalog filters → exact product/size/dates; price/availability; missing price; cancellation rejects late result; fitting remains unsent draft');
  await click('♡ В избранное', 'document.querySelector(".product-detail-ready")');
  await navigate('/showroom?view=favorites'); await until(() => evaluate('!!document.querySelector(".favorites-page .showroom-product")'), 'favorites revalidation');
  assert(await evaluate('document.querySelector(".favorites-page").innerText.includes("Synthetic dress 2")'));
  await evaluate('window.dispatchEvent(new CustomEvent("fixture-favorites-fail"))');await until(()=>evaluate('document.querySelector(".favorites-page").innerText.includes("Повторить проверку товаров")'),'favorite failure');await click('Повторить проверку товаров');await until(()=>evaluate('!!document.querySelector(".favorite-choice input")'),'favorite retry');
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
    await set('[name=variantId]',id(12));await set('.rental-date-range [name=from]','2026-12-10T12:00');await set('.rental-date-range [name=until]','2026-12-11T18:00');
    failSelectionOnce=true;await click('Проверить размер и даты');await until(()=>evaluate('document.querySelector("[role=alert]")?.innerText.includes("Synthetic temporary failure")'),'mobile failure');
    assert.equal(await evaluate('!!document.querySelector(".inquiry-draft")'),false);
    await click('Проверить размер и даты');await until(()=>evaluate('document.querySelector(".product-detail-ready > .showroom-contact > [role=status]")?.innerText.includes("Доступно")'),'mobile retry');
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
