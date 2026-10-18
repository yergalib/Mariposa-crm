// Reuse the isolated real-React browser harness; only synthetic presentation DTOs.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.join(__dirname,'showroom-browser-local.cjs');
let source=fs.readFileSync(filename,'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'showroom-browser-fixture.tsx'),'utf8')
 .replace('import { createRoot }', 'import { AssistantComparisonCard } from "../app/showroom/AssistantProductCard";\nimport { catalogSizeLabel, compareCatalogSizes } from "../lib/showroom/size-presentation";\nimport { createRoot }')
 .replace('let failedFavorites = false;', `
const qaSizes=['140','98','110','104'].map(code=>({name:code,code,sizeSystem:'HEIGHT_CM',recommendedHeightCm:null})).sort(compareCatalogSizes);
products[0]={...products[0],name:'6119 — синтетическая проверка полного длинного названия праздничного платья',color:null,execution:null,colorLabel:undefined,sizes:qaSizes.map(catalogSizeLabel),options:qaSizes.map((s,i)=>({id:id(900+i),size:catalogSizeLabel(s),sizeCode:s.code,price:{amountMinor:'12000',currency:'KZT'}}))};
let failedFavorites = false;`)
 .replace('{body}</ShowroomFrame>', '{body}{query.get("qaComparison") && <section className="qa-comparison"><AssistantComparisonCard product={products[0]} /></section>}</ShowroomFrame>');
source=source.replace('build.onResolve({ filter:',`build.onLoad({filter:/showroom-browser-fixture\\.tsx$/},()=>({contents:${JSON.stringify(fixture)},loader:'tsx',resolveDir:path.join(root,'scripts')}));\n    build.onResolve({ filter:`);
const start=source.indexOf("  await send('Page.navigate', { url: origin + '/showroom'");
const end=source.indexOf("  assert.equal(requests.filter(r => r.method === 'POST').length, 0, 'no writes');");
if(start<0||end<0)throw Error('Harness anchors changed');
source=source.slice(0,start)+`
  await send('Page.navigate',{url:origin+'/showroom?view=catalog'});
  await until(()=>evaluate('!!document.querySelector(".catalog-product-card")'),'catalog');
  for(const width of [390,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
    await navigate('/showroom?view=catalog');await delay(250);await layout('catalog '+width);
    assert(await evaluate('document.querySelector(".catalog-product-card").innerText.includes("Цвет не указан")'));
    assert(await evaluate('(()=>{const h=document.querySelector(".catalog-product-card h2");return h.scrollHeight<=h.clientHeight+1&&getComputedStyle(h).webkitLineClamp==="none"})()'));
    await shot('integrated-catalog-'+width);
    await navigate('/showroom?productId='+id(2));
    await until(()=>evaluate('!!document.querySelector("select[name=variantId]")'),'size selector');
    const sizes=await evaluate('[...document.querySelector("select[name=variantId]").options].map(x=>x.textContent).filter(x=>x.includes("Рост"))');
    assert.deepEqual(sizes,['Рост 98 см','Рост 104 см','Рост 110 см','Рост 140 см']);
    await set('select[name=variantId]',id(902));
    assert.equal(await evaluate('document.querySelector("select[name=variantId]").selectedOptions[0].textContent'),'Рост 110 см');
    await layout('detail '+width);await evaluate('document.querySelector("select[name=variantId]").scrollIntoView({block:"center"})');await shot('integrated-110-'+width);
    await navigate('/showroom?view=catalog&qaComparison=1');
    await evaluate('document.querySelector(".qa-comparison").style.maxWidth="560px";document.querySelector(".qa-comparison .showroom-product-info").scrollIntoView({block:"center"})');await delay(150);
    assert(await evaluate('document.querySelector(".qa-comparison").innerText.replaceAll(String.fromCharCode(160)," ").replaceAll(String.fromCharCode(8239)," ").includes("12 000")'));
    assert(await evaluate('document.querySelector(".qa-comparison").innerText.includes("Наличие на выбранные даты ещё не проверено")'));
    await layout('AI comparison '+width);await shot('integrated-ai-card-'+width);
    tests.push(width+'px: 6119 missing colour, full title, ordered height 110 selection, existing AI comparison price/unknown availability');
  }
`+source.slice(end);
const run=new Module(filename,module);run.filename=filename;run.paths=module.paths;run._compile(source,filename);
