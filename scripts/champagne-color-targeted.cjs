const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
const resolve=Module._resolveFilename;Module._resolveFilename=function(n,...a){return resolve.call(this,n.startsWith('@/')?path.resolve(n.slice(2)):n,...a)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {confirmedColorMatches:matches,normalizeRequestedColor}=require('../lib/assistant/colors.ts');
const {catalogColorGroupMatches:group,resolveCatalogColor}=require('../lib/showroom/color-groups.ts');
for(const [raw,color,bucket] of [['белый + шелк','Белый','white'],['БЕЛЫЙ + ШЁЛК','Белый','white'],['белый + велюр','Белый','white'],['чёрный + велюр','Чёрный','black'],['шампань + шелк','Шампань','champagne-beige'],['шампань + велюр','Шампань','champagne-beige']]) {
 assert(matches(color,raw,'Розовый'));assert(group(bucket,raw,'Розовый'));
 assert.deepEqual(resolveCatalogColor(raw,'Розовый'),{group:bucket,confirmed:true,label:'Цвет: '+raw});
 assert.throws(()=>normalizeRequestedColor(raw),'catalog materials must not loosen user request parsing');
}
for(const raw of ['белый + неизвестное','чёрный + велюр + неизвестное','шампань + шелк + неизвестное','не белый + шелк']) {
 assert.equal(resolveCatalogColor(raw,'Белый').confirmed,false);assert(!matches('Белый',raw,'Белый'));assert(!matches('Чёрный',raw,'Белый'));assert(!matches('Шампань',raw,'Белый'));
}
assert.equal(resolveCatalogColor('белый + чёрный + велюр',null).confirmed,false);
assert(matches('Белый','белый + чёрный + велюр',null));assert(matches('Чёрный','белый + чёрный + велюр',null));
assert(!group('white','белый + чёрный + велюр',null));assert(!group('black','белый + чёрный + велюр',null));
for(const raw of ['Шампань',' шампань + рукав ','ШАМПАНЬ+РУКАВ']){
 assert(matches('жёлтый',raw,null));assert(matches('шампань',raw,null));assert(group('yellow',raw,null));assert(group('champagne-beige',raw,null));
 assert.equal(resolveCatalogColor(raw,null).label,'Цвет: '+raw.trim());
}
assert(!matches('шампань','Жёлтый',null));assert(matches('yellow',null,'champagne'));
for(const raw of ['Бежевый','Золотой','не шампань','шампань + неизвестное','Новинка']){
 assert(!matches('жёлтый',raw,'Жёлтый'));assert(!group('yellow',raw,'Жёлтый'));
}
assert(!group('yellow','Шампань + белый',null));
assert.equal(normalizeRequestedColor('шампань'),'Шампань');
assert.throws(()=>normalizeRequestedColor('шампань + рукав'),'product descriptors do not weaken request validation');
assert(group('yellow','Жёлтый',null));assert(!group('champagne-beige','Жёлтый',null));
console.log('PASS: yellow includes champagne one-way; approved sleeve descriptor retains original display; beige/gold/unknown/negated/mixed guards and execution precedence preserved. No DB/network.');
