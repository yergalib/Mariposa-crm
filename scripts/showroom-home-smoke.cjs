// Isolated rendered-markup regression: synthetic DTOs only, no DB, browser or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
require.extensions['.css']=()=>{};
const load=Module._load,resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){
 if(id==='next/link')return {__esModule:true,default:({children,...props})=>require('react').createElement('a',props,children)};
 if(id==='next/image')return {__esModule:true,default:({unoptimized,priority,...props})=>require('react').createElement('img',props)};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {ShowroomHome}=require('../app/showroom/ShowroomHome.tsx'),{ShowroomFrame}=require('../app/showroom/ShowroomPresentation.tsx'),{Showroom}=require('../app/showroom/Showroom.tsx');
const {benefits,brandStory}=require('../app/showroom/site-content.ts');
const id='11111111-1111-4111-8111-111111111111';
const item={id:id+':default',productId:id,executionId:null,name:'Synthetic dress',execution:null,color:'Розовый',colorLabel:'Цвет: Розовый',sizes:['104','116'],images:[{id:'photo',src:'/api/showroom/photo?synthetic=1',alt:'Synthetic pink dress',width:1,height:1}]};
const home=renderToStaticMarkup(React.createElement(ShowroomFrame,{intro:false},React.createElement(ShowroomHome,{items:[item]})));
assert.equal((home.match(/<h1/g)||[]).length,1);assert.ok(home.includes('Найдите идеальное платье для вашего праздника'));assert.ok(home.includes('Выберите цвет'));assert.ok(!home.includes('Для какого события ищете платье?'));assert.ok(home.includes('colorGroup=pink'));assert.ok(!home.includes('site-color-swatch'));assert.ok(home.includes('colorGroup=white'));assert.ok(home.includes('Все цвета и фильтры каталога'));assert.ok(!home.includes('Размеры в каталоге:'));assert.ok(!home.includes('Цвет не указан'));assert.ok(home.includes('favorite-icon'));
for(const [title,description]of benefits){assert.ok(!home.includes(title));assert.ok(!home.includes(description))}assert.ok(home.includes(brandStory));
assert.ok(home.includes('Праздничный образ без покупки'));assert.ok(home.includes('Подберите платье, обувь и аксессуары в одном месте. После праздника верните наряд'));
const benefit=home.match(/<section[^>]*site-benefits[\s\S]*?<\/section>/)[0];assert.ok(!benefit.includes('<article'));assert.ok(!benefit.includes('01'));assert.ok(home.includes('Как работает аренда'));assert.equal((home.match(/<li>/g)||[]).length,4);
assert.ok(home.includes('Платья из каталога'));assert.ok(!home.includes('Популярные'));assert.ok(home.includes('Synthetic dress'));assert.ok(home.includes('Уточнить стоимость'));assert.ok(home.includes('view=catalog'));assert.ok(home.includes('productId='+id));
for(const token of ['id="rental"','id="contacts"','https://wa.me/77785274882','https://www.instagram.com/mariposa.kz/','70000001088052748','Ежедневно 11:00–20:00'])assert.ok(home.includes(token));
for(const forbidden of ['tel:','до 80%','15 000','невозврат','не отправляется','ссылки ожидаются','input type="datetime-local"'])assert.ok(!home.includes(forbidden));
const empty=renderToStaticMarkup(React.createElement(ShowroomHome,{items:[],catalogUnavailable:true}));assert.ok(empty.includes('Каталог временно недоступен'));assert.ok(empty.includes('Контакты'));assert.ok(!empty.includes('Synthetic dress'));
const catalog=renderToStaticMarkup(React.createElement(Showroom,{catalog:{items:[item],page:1,more:false},filters:{search:'',categoryId:'',page:1},categories:[{id,name:'Платья'}],branches:[{id,city:'Synthetic',name:'Synthetic',timezone:'Asia/Almaty'}]}));
assert.ok(catalog.includes('method="get"'));assert.ok(catalog.includes('name="view" value="catalog"'));assert.ok(catalog.includes('name="from"'));assert.ok(catalog.includes('name="until"'));assert.ok(catalog.includes('name="size"'));assert.ok(catalog.includes('name="colorGroup"'));assert.ok(catalog.includes('Synthetic dress'));assert.ok(!catalog.includes('Размеры в каталоге:'));assert.ok(catalog.includes('Выбрать размер'));assert.ok(catalog.includes('favorite-icon'));assert.ok(catalog.includes('Выберите для цены и наличия'));
assert.ok(!catalog.includes('name="organizationId"'));assert.ok(!catalog.includes('name="tenantId"'));assert.ok(!catalog.includes('name="price"'));
console.log('PASS: rendered home/catalog; approved content; real DTO rendering and empty state; owner contacts; no invented call number/price/policy; optional native filter form and tenant-free UI. Synthetic data only.');

const {ProductRecommendations}=require('../app/showroom/ProductRecommendations.tsx');const rec=renderToStaticMarkup(React.createElement(ProductRecommendations,{other:[item],complements:[{...item,id:'accessory'}],filters:{search:'old',categoryId:'',page:2,size:'140',colorGroup:'pink',branchId:id,from:'2026-12-10T12:00',until:'2026-12-11T18:00'}}));const links=[...rec.matchAll(/href="([^"]*productId[^"]*)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),'http://example.invalid'));assert.equal(links.length,2);assert.equal(links[0].searchParams.get('size'),null);assert.equal(links[1].searchParams.get('size'),'140');for(const url of links){assert.equal(url.searchParams.get('branchId'),id);assert.equal(url.searchParams.get('from'),'2026-12-10T12:00');}console.log('PASS: accessory links clear dress sizing; recommendation links retain branch and dates.');

const {colorPhotoCards}=require('../lib/showroom/color-cards.ts');assert.equal(colorPhotoCards([{...item,images:[]}]).length,0);assert.equal(colorPhotoCards([{...item,execution:'Белый'}])[0].id,'white');assert.equal(colorPhotoCards([{...item,execution:'Розовый и белый'}]).length,0);assert.equal(colorPhotoCards([{...item,color:null}]).length,0);console.log('PASS: photo cards use confirmed execution/model colour; no photo, mixed and unknown colours omitted.');

// Owner-selected marketing colour photos remain available independently of CRM data.
const marketing=require('../lib/showroom/marketing-photos.json').photos.filter(photo=>photo.role==='color');
assert.equal(marketing.length,7);
for(const photo of marketing){assert.ok(home.includes('colorGroup='+photo.id));assert.ok(empty.includes('colorGroup='+photo.id));for(const asset of photo.assets)assert.ok(home.includes(asset.src));}
assert.ok(empty.includes('Выберите цвет'));assert.ok(empty.includes('Все цвета и фильтры каталога'));
for(const color of ['Молочный','Айвори','Жёлтый','Золотой']) assert.equal(colorPhotoCards([{...item,color}])[0].id,'other');
const full=[...Array.from({length:12},()=>({...item,images:[]})),{...item,color:'Чёрный'}];assert.equal(colorPhotoCards(full)[0].id,'black');
const distinct=renderToStaticMarkup(React.createElement(ShowroomHome,{items:[item],colorCards:colorPhotoCards(full)}));assert.ok(distinct.includes('colorGroup=black'));assert.ok(distinct.includes('colorGroup=pink'));for(const photo of marketing)assert.ok(distinct.includes('colorGroup='+photo.id));
console.log('PASS: all seven approved marketing colours persist without CRM photos; known milk/ivory/yellow/gold remain Other in CRM resolver; first-page products do not redefine marketing colours.');

const about=home.match(/<section[^>]*site-about-text[\s\S]*?<\/section>/)[0];assert.ok(about.includes(brandStory));assert.ok(!about.includes("<img"));assert.ok(!about.includes("showroom-photo"));assert.ok(!home.includes("/brand/hero/approved-studio.png"));
