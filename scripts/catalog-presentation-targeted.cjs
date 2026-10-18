// Synthetic presentation regression; no database or provider.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {catalogSizeLabel:label,compareCatalogSizes:compare,catalogSizeWhere:where}=require('../lib/showroom/size-presentation.ts');
const height=code=>({name:code,code,sizeSystem:'HEIGHT_CM',recommendedHeightCm:null});
assert.deepEqual(['140','98','110','104'].map(height).sort(compare).map(label),['Рост 98 см','Рост 104 см','Рост 110 см','Рост 140 см']);
assert.deepEqual(where(label(height('110'))),{sizeSystem:'HEIGHT_CM',code:{equals:'110',mode:'insensitive'}});
const manufacturer={name:'32',code:'32',sizeSystem:'MANUFACTURER_SIZE',recommendedHeightCm:110};
assert.equal(label(manufacturer),'Размер 32 · рост 110 см');
assert.deepEqual(where(label(manufacturer)),{sizeSystem:'MANUFACTURER_SIZE',code:{equals:'32',mode:'insensitive'},recommendedHeightCm:110});
assert.equal(label({...manufacturer,sizeSystem:'SHOE_EU',recommendedHeightCm:null}),'32');
assert.equal(label({...manufacturer,name:'XS',code:'XS',sizeSystem:'ALPHA',recommendedHeightCm:null}),'XS');
assert.deepEqual(where('110'),{OR:[{name:{equals:'110',mode:'insensitive'}},{code:{equals:'110',mode:'insensitive'}}]});
for(const name of ['Showroom','ShowroomProductDetail'])assert(fs.readFileSync(`app/showroom/${name}.tsx`,'utf8').includes('"Цвет не указан"'));
console.log('PASS: explicit height 110, numeric order, manufacturer and shoe/alpha preservation, display-label filter roundtrip, legacy filter and missing-colour fallback.');
