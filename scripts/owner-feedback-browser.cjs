// Reuse real components/CSS in a fresh headless profile; no user's tabs or live APIs.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.join(__dirname,'showroom-browser-local.cjs');
let source=fs.readFileSync(filename,'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'showroom-browser-fixture.tsx'),'utf8').replace('page: 1, more: false','page: filters.page, more: filters.page < 2').replace('import { createRoot }', 'import { InquiryAccessProvider } from "../app/showroom/InquiryAccess";\nimport { createRoot }').replace('{body}</ShowroomFrame>', '{<InquiryAccessProvider enabled={true}>{body}</InquiryAccessProvider>}</ShowroomFrame>');
source=source.replace('build.onResolve({ filter:',`build.onLoad({filter:/showroom-browser-fixture\\.tsx$/},()=>({contents:${JSON.stringify(fixture)},loader:'tsx',resolveDir:path.join(root,'scripts')}));\n    build.onResolve({ filter:`);
const start=source.indexOf("  await send('Page.navigate', { url: origin + '/showroom'");
const end=source.indexOf("  assert.equal(requests.filter(r => r.method === 'POST').length, 0, 'no writes');");
if(start<0||end<0)throw Error('Harness anchors changed');
source=source.slice(0,start)+`
 await send('Page.navigate',{url:origin+'/showroom?view=catalog&fixtureBranches=one'});
 await until(()=>evaluate('!!document.querySelector(".catalog-product-card")'),'catalog');
 for(const width of [390,430,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
  await navigate('/showroom?view=catalog&fixtureBranches=one');await layout('catalog '+width);
  assert(!(await evaluate('document.querySelector(".catalog-main").innerText')).includes('Asia/Almaty'));
  assert(await evaluate('!!document.querySelector(".catalog-page-button[aria-disabled=true]")'));
  assert(await evaluate('document.querySelector(".catalog-page-button[rel=next]").getBoundingClientRect().height>=44'));
  await evaluate('document.querySelector(".showroom-pages").scrollIntoView({block:"center"});document.querySelector(".catalog-page-button[rel=next]").focus()');await shot('feedback-pagination-'+width);
  await click('Следующая →');assert.equal(await evaluate('new URL(location.href).searchParams.get("page")'),'2');
  assert(await evaluate('!!document.querySelector(".catalog-page-button[rel=prev]")'));await click('← Предыдущая');
  const detail='/showroom?view=catalog&productId='+id(2)+'&branchId='+id(1)+'&from=2026-12-10T12:00&until=2026-12-11T18:00';
  await navigate(detail);await set('[name=variantId]',id(12));await click('Проверить размер и даты');
  await until(()=>evaluate('!!document.querySelector(".availability-yes")'),'available');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".availability-yes")).color'),'rgb(22, 99, 58)');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".availability-yes")).fontWeight'),'700');
  await evaluate('document.querySelector(".availability-yes").scrollIntoView({block:"center"})');await shot('feedback-available-'+width);
  await set('[name=variantId]',id(22));await click('Проверить размер и даты');await until(()=>evaluate('!!document.querySelector(".availability-no")'),'unavailable');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".availability-no")).color'),'rgb(163, 36, 50)');
  await evaluate('document.querySelector(".availability-no").scrollIntoView({block:"center"})');await shot('feedback-unavailable-'+width);
  await set('[name=variantId]',id(12));failSelectionOnce=true;await click('Проверить размер и даты');
  await until(()=>evaluate('document.querySelector("[role=alert]")?.innerText.includes("Synthetic temporary failure")'),'error');
  assert.equal(await evaluate('document.querySelectorAll(".availability-no,.availability-yes").length'),0);
  await layout('detail '+width);tests.push(width+'px: pagination focus/disabled/navigation/touch; IANA hidden; green/red bold status; error not unavailable');
 }
`+source.slice(end);
const run=new Module(filename,module);run.filename=filename;run.paths=module.paths;run._compile(source,filename);
