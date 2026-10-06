// Actual component hydration + fallback DOM in installed Chrome, synthetic only.
// iOS routing is simulated; this does not claim an iOS/WebKit print-dialog test.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const app=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(app,'../label-print-evidence'));
fs.mkdirSync(out,{recursive:true});
const esbuild=require('esbuild');
const fixture=`import React from 'react';import {LabelPrintSheet} from './components/catalog/LabelPrintSheet';
const labels=[{id:'one',code:'MP-R0071.ONE',name:'Браслет <script>window.injected=true</script>',description:'Первый'},{id:'two',code:'0053.150',name:'Второй',description:'Размер 150'}];
const content=<main className='label-print-page'><LabelPrintSheet labels={labels}/></main>;`;
let server,chrome,ws;let seq=0;const pending=new Map(),errors=[],checks=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){try{const r=await fn();if(r)return r;}catch{}await delay(100);}throw Error('local wait timeout');}
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error(method+' timeout'));},10000).unref();});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function click(selector){const rect=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1});}
async function test(name,fn){await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}
(async()=>{try{
const opts={bundle:true,jsx:'automatic',absWorkingDir:app,tsconfig:path.join(app,'tsconfig.json'),define:{'process.env.NODE_ENV':'"production"'}};
await esbuild.build({...opts,stdin:{contents:fixture+`import {renderToString} from 'react-dom/server';export const html=renderToString(content);`,loader:'tsx',resolveDir:app},platform:'node',outfile:path.join(out,'ssr.cjs')});
const html=require(path.join(out,'ssr.cjs')).html;assert.ok(!html.includes('<rect')); // barcode is rendered on mount, not SSR
await esbuild.build({...opts,stdin:{contents:fixture+`import {hydrateRoot} from 'react-dom/client';hydrateRoot(document.getElementById('root'),content);`,loader:'tsx',resolveDir:app},platform:'browser',outfile:path.join(out,'fixture.js')});
const css=fs.readFileSync(path.join(app,'app/labels.css'),'utf8');
server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html; charset=utf-8');res.end(req.url==='/fixture.js'?fs.readFileSync(path.join(out,'fixture.js')):`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}${css}</style><div id="root">${html}</div><script src="/fixture.js"></script>`);});await new Promise(r=>server.listen(62334,'127.0.0.1',r));
chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-background-networking','--disable-sync','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port=62335','--user-data-dir='+path.join(out,'chrome-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
const target=await until(async()=>{const r=await fetch('http://127.0.0.1:62335/json/new?about:blank',{method:'PUT'});return r.ok?r.json():null;});ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:62334'});
await test('SSR hydrates, SVG renders, selection and copy handlers update real sheet',async()=>{
await until(()=>evaluate('document.querySelectorAll("svg rect").length>0'));
await click('.label-print-options input');await until(()=>evaluate('document.querySelector("button.primary").textContent.includes("1")'));
await evaluate(`(()=>{const e=document.querySelector('input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await until(()=>evaluate('document.querySelectorAll(".printed-label").length===2'));
assert.deepEqual(await evaluate('[...document.querySelectorAll(".printed-label>small")].map(e=>e.textContent)'),['0053.150','0053.150']);
});
await test('desktop retains native current-window printing without popup',async()=>{
await evaluate('window.before=0;window.addEventListener("beforeprint",()=>window.before++);window.originalOpen=window.open;window.open=()=>{throw Error("desktop popup regression")};');await click('button.primary');assert.equal(await evaluate('window.before'),1);await evaluate('window.open=window.originalOpen');
});
await test('iPhone branch opens complete snapshot with exact selection/copies and invokes native print',async()=>{
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await evaluate(`Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});window.attempts=0;window.popupBefore=0;window.open=(...args)=>{window.openWasActive=navigator.userActivation.isActive;const p=window.originalOpen(...args);window.popup=p;const native=p.print.bind(p);p.print=()=>{window.attempts++;p.addEventListener('beforeprint',()=>window.popupBefore++,{once:true});native();};return p;};`);
await click('button.primary');assert.equal(await evaluate('window.openWasActive'),true);assert.equal(await evaluate('window.attempts'),1);await until(()=>evaluate('window.popupBefore===1'));
const snapshot=await evaluate(`({ready:popup.document.readyState,opener:popup.opener,labels:[...popup.document.querySelectorAll('.printed-label>small')].map(e=>e.textContent),rects:popup.document.querySelectorAll('svg rect').length,assets:popup.document.querySelectorAll('script,link,iframe,img').length,closed:popup.closed})`);
assert.equal(snapshot.ready,'complete');assert.equal(snapshot.opener,null);assert.deepEqual(snapshot.labels,['0053.150','0053.150']);assert.ok(snapshot.rects>0);assert.equal(snapshot.assets,0);assert.equal(snapshot.closed,false);
});
await test('standalone native retry works without React and preserves printable A4 content',async()=>{
await evaluate(`popup.document.querySelector('button').click()`);assert.equal(await evaluate('window.attempts'),2);assert.equal(await evaluate('popup.closed'),false);
const p=await evaluate(`({style:popup.document.querySelector('style').textContent,body:popup.document.body.textContent})`);assert.ok(p.style.includes('size:A4'));assert.ok(p.style.includes('nav{display:none!important}'));assert.ok(p.body.includes('0053.150'));await evaluate('popup.close()');
});
await test('blocked popup gives visible recovery message; unready SVG never opens partial sheet',async()=>{
await evaluate('window.open=()=>null');await click('button.primary');assert.ok((await evaluate('document.querySelector("[role=alert]").textContent')).includes('Разрешите'));
await evaluate('window.open=()=>{throw Error("unready sheet opened")};document.querySelector(".printed-label svg").replaceChildren()');await click('button.primary');assert.ok((await evaluate('document.querySelector("[role=alert]").textContent')).includes('ещё не готовы'));
});
await test('empty selection remains disabled; iPad detection and cloned text cannot execute markup',async()=>{
await click('.label-print-toolbar button.secondary:nth-of-type(2)');assert.equal(await evaluate('document.querySelector("button.primary").disabled'),true);
await click('.label-print-toolbar button.secondary');await until(()=>evaluate('document.querySelectorAll(".printed-label svg rect").length>0'));
await evaluate(`Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Macintosh Safari'});Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:5});window.open=(...args)=>{window.popup=window.originalOpen(...args);return popup;};`);
await click('button.primary');assert.equal(await evaluate('popup.document.querySelectorAll(".printed-label").length'),4);assert.equal(await evaluate('Boolean(popup.injected||window.injected)'),false);assert.ok((await evaluate('popup.document.body.textContent')).includes('<script>window.injected=true</script>'));await evaluate('popup.close()');
});
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PASS',checks,errors,limitations:['Chrome real hydration/DOM/print calls; iOS platform routing simulated, not WebKit/iPhone','System dialog and physical printing require owner device acceptance','No DB, app server, credentials or Production calls']},null,2));
}catch(e){console.error(e);process.exitCode=1;fs.writeFileSync(path.join(out,'failure.txt'),String(e));}finally{if(ws){try{await send('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();if(server)server.close();}})();
