// Mock UI interaction with existing, unpublished and newly chosen favorite IDs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,resolve=Module._resolveFilename;
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const refs=[1,2,3,4,5,6].map(n=>({productId:id(n),executionId:null}));
let selected=refs.slice(0,4);
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)};
Module._load=function(id,...args){
 if(id==='react')return {useEffect:()=>{}};
 if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(id==='next/link')return ()=>null;
 if(id==='next/navigation')return {useRouter:()=>({replace(){}})};
 if(id==='./FavoriteButton')return {FavoriteButton:()=>null,useFavorites:()=>refs,useFavoritesReady:()=>true};
 if(id==='./TabState')return {useTabState:()=>[selected,update=>{selected=typeof update==='function'?update(selected):update}]};
 if(id==='./ShowroomPresentation')return {PhotoPlaceholder:()=>null};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {Favorites}=require('../app/showroom/Favorites.tsx');
const {favoriteKey}=require('../lib/showroom/favorites.ts');
const results=refs.map((ref,i)=>({ref,product:i?{...ref,id:favoriteKey(ref),name:'Synthetic '+i,color:null,execution:null,options:[]}:null,unavailable:!i}));
const render=()=>Favorites({results,loadedKeys:refs.map(favoriteKey).join(',')});
function all(n,p){if(!n||typeof n!=='object')return [];return [...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>all(c,p))]}
const checkbox=(tree,index)=>all(tree,n=>n.props?.type==='checkbox')[index];
let tree=render();assert.equal(checkbox(tree,3).props.disabled,false,'only three currently public comparisons');
checkbox(tree,3).props.onChange({target:{checked:true}});
assert.ok(selected.some(ref=>ref.productId===id(5)),'new public choice must not be discarded by an old unpublished slot');
assert.ok(!selected.some(ref=>ref.productId===id(1)),'unpublished slot removed on edit');assert.equal(selected.length,4);
tree=render();assert.equal(checkbox(tree,4).props.disabled,true,'four-public-item limit preserved');
checkbox(tree,0).props.onChange({target:{checked:false}});tree=render();assert.equal(checkbox(tree,4).props.disabled,false);checkbox(tree,4).props.onChange({target:{checked:true}});
assert.equal(selected.length,4);assert.equal(new Set(selected.map(favoriteKey)).size,4);assert.ok(selected.some(ref=>ref.productId===id(6)));
console.log('PASS: unpublished favorite does not consume a comparison slot; replacement is retained; four-item limit and deselection hold. Mock only.');
