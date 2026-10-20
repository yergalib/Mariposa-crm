const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const resolve=Module._resolveFilename;Module._resolveFilename=function(n,...a){return resolve.call(this,n.startsWith('@/')?path.resolve(n.slice(2)):n,...a)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,f);
const {resolveCatalogColor}=require('../lib/showroom/color-groups.ts');
const {confirmedColorMatches,normalizeRequestedColor}=require('../lib/assistant/colors.ts');
for(const raw of ['жемчуг','по 1000','не розовый','розовый + неизвестно','розовый + жемчуг + белый']) {
 assert.equal(resolveCatalogColor(raw,'Розовый').confirmed,false,raw);
 assert.equal(confirmedColorMatches('Розовый',raw,'Розовый'),false,raw);
}
assert.equal(resolveCatalogColor(null,null).confirmed,false);
assert.equal(resolveCatalogColor('разноцветный',null).group,'other');
assert.equal(confirmedColorMatches('Розовый','разноцветный',null),false);
assert.throws(()=>normalizeRequestedColor('розовый + жемчуг'));
assert.equal(resolveCatalogColor('по 1000','Розовый').label,'Исполнение: по 1000');
const {catalogSizeWhere,catalogSizeLabel}=require('../lib/showroom/size-presentation.ts');
for(const raw of ['140.5','140,5','140-146','0','-140','13 лет']) assert(!JSON.stringify(catalogSizeWhere(raw)).includes('recommendedHeightCm'),raw);
const label='Размер 13 · рост 140 см';assert.deepEqual(catalogSizeWhere(label),{sizeSystem:'MANUFACTURER_SIZE',code:{equals:'13',mode:'insensitive'},recommendedHeightCm:140});
assert.equal(catalogSizeLabel({name:'13',code:'13',sizeSystem:'MANUFACTURER_SIZE',recommendedHeightCm:null}),'13');
console.log('PASS: exact approved descriptors, unknown/negative/material/price exclusions, strict requested colour, no height inference or ranges.');
