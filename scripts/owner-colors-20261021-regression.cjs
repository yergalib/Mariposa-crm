// Offline only: owner-approved colour descriptors and conservative negatives.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file){const p=path.resolve(file),m=new Module(p,module);m.filename=p;m.paths=module.paths;m.require=id=>id==='@/lib/assistant/colors'?load('lib/assistant/colors.ts'):require(id);m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);return m.exports;}
const c=load('lib/assistant/colors.ts'),g=load('lib/showroom/color-groups.ts');
const cases=[['новинка голубая','Голубой','blue','Новинка'],['белый / малыши (S-линия)','Белый','white','S-линия'],['розовый / малыши (S-линия)','Розовый','pink','S-линия'],['шампань / малыши (S-линия)','Шампань','champagne-beige','S-линия'],['красный / основная линия','Красный','red','основная линия'],['серебро','Серебристый','other','серебро']];
for(const [raw,color,group,detail] of cases){const r=g.resolveCatalogColor(raw,'чёрный');assert.equal(r.confirmed,true);assert.equal(r.group,group);assert.ok(r.label.includes(detail));assert.ok(!r.label.includes('не подтвержд'));assert.equal(c.normalizeCatalogColor(raw),color);assert.equal(c.confirmedColorMatches(color,raw,'чёрный'),true);assert.equal(c.confirmedColorMatches('Чёрный',raw,'чёрный'),false);assert.equal(g.catalogColorGroupMatches(group,raw,null),true);}
assert.equal(g.catalogColorGroupMatches('yellow','шампань / малыши (S-линия)',null),false);
for(const raw of ['белый / неизвестная линия','голубой + красный','новинка голубая красная','серебро + жемчуг','лиловый','тиффани','бордо']){assert.equal(g.resolveCatalogColor(raw,'белый').confirmed,false);assert.equal(c.confirmedColorMatches('Белый',raw,'белый'),false);}
assert.equal(g.resolveCatalogColor(null,null).label,'Цвет не указан');
assert.equal(g.resolveCatalogColor('по 1000',null).label,'Исполнение: по 1000');
assert.equal(g.resolveCatalogColor('розовый + жемчуг',null).label,'Цвет: розовый · Отделка: жемчуг');
assert.equal(g.resolveCatalogColor('разноцветный',null).confirmed,true);
for(const [raw,color] of [['голубой','Голубой'],['белый','Белый'],['красный','Красный'],['шампань','Шампань']])assert.equal(c.normalizeCatalogColor(raw),color);
console.log('PASS: 6 approved descriptors, colour filters, preserved line/novelty labels, 7 conservative negatives, existing exceptions; zero network/DB/AI calls');
