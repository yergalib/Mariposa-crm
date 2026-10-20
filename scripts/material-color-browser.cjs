// Actual catalogue React/CSS, synthetic DTOs, no database or live API.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.join(__dirname,'showroom-browser-local.cjs');
let source=fs.readFileSync(filename,'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'showroom-browser-fixture.tsx'),'utf8')
 .replace('import { createRoot }', 'import { resolveCatalogColor } from "../lib/showroom/color-groups";\nimport { createRoot }')
 .replace('let failedFavorites = false;', `
for (const [i, execution] of ['белый + шелк','белый + велюр','чёрный + велюр','белый + неизвестное'].entries()) {
 products[i]={...products[i],name:'2366 — синтетическая проверка',execution,color:null,colorLabel:resolveCatalogColor(execution,null).label};
}
let failedFavorites = false;`);
source=source.replace('build.onResolve({ filter:',`build.onLoad({filter:/showroom-browser-fixture\\.tsx$/},()=>({contents:${JSON.stringify(fixture)},loader:'tsx',resolveDir:path.join(root,'scripts')}));\n    build.onResolve({ filter:`);
const start=source.indexOf("  await send('Page.navigate', { url: origin + '/showroom'");
const end=source.indexOf("  assert.equal(requests.filter(r => r.method === 'POST').length, 0, 'no writes');");
if(start<0||end<0)throw Error('Harness anchors changed');
source=source.slice(0,start)+`
  await send('Page.navigate',{url:origin+'/showroom?view=catalog'});
  await until(()=>evaluate('!!document.querySelector(".catalog-product-card")'),'catalog');
  for(const width of [390,430]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:true});
    await navigate('/showroom?view=catalog');await delay(250);await layout('material cards '+width);
    const cards=await evaluate('[...document.querySelectorAll(".catalog-product-card")].map(e=>e.innerText)');
    for(const [i,raw] of ['белый + шелк','белый + велюр','чёрный + велюр'].entries())assert(cards[i].includes('Цвет: '+raw));
    assert(cards[3].includes('Цвет не подтверждён · белый + неизвестное'));
    await evaluate('document.querySelector(".catalog-product-card").scrollIntoView({block:"start"})');
    await shot('material-color-'+width);tests.push(width+'px: original approved materials confirmed; unknown remains unconfirmed');
  }
`+source.slice(end);
const run=new Module(filename,module);run.filename=filename;run.paths=module.paths;run._compile(source,filename);
