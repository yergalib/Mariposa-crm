// Local-only real React fixture. Synthetic data, no DB/provider/POST routes.
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-dates-'));
(async () => {
  await esbuild.build({
    absWorkingDir: root, stdin: {resolveDir: root, loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {Showroom} from './app/showroom/Showroom';
      import {resolveCatalogColor} from './lib/showroom/color-groups';
      import {catalogSizeLabel,catalogSizeWhere} from './lib/showroom/size-presentation';
      import './app/showroom/showroom.css'; import './app/showroom/site.css';
      const filters={search:'',categoryId:'',page:1,...Object.fromEntries(new URLSearchParams(location.search))};
      const sizes=[{name:'13',code:'13',sizeSystem:'MANUFACTURER_SIZE',recommendedHeightCm:140},{name:'140',code:'140',sizeSystem:'HEIGHT_CM',recommendedHeightCm:null},{name:'13',code:'13',sizeSystem:'MANUFACTURER_SIZE',recommendedHeightCm:null}];
      function match(o,w){return Object.entries(w).every(([k,v])=>k==='OR'?v.some(q=>match(o,q)):typeof v==='object'?String(o[k]).toLowerCase()===v.equals.toLowerCase():o[k]===v)}
      const items=['розовый + жемчуг','разноцветный','по 1000'].map((execution,i)=>({id:String(i),productId:String(i),executionId:null,name:'Синтетический пример '+(i+1),execution,color:null,colorLabel:resolveCatalogColor(execution,null).label,sizes:[catalogSizeLabel(sizes[i])],images:[]})).filter((item,i)=>!filters.size||match(sizes[i],catalogSizeWhere(filters.size)));
      createRoot(document.getElementById('root')).render(<><h1>Локальная проверка — синтетические товары</h1><Showroom catalog={{items,page:1,more:false}} categories={[]} branches={[]} filters={filters}/><aside aria-label="Проверка маркировок">{items.map(x=><p key={x.id}>{x.name}: {x.sizes.join(', ')}</p>)}</aside></>);
    `}, outdir: out, bundle: true, jsx: 'automatic', platform: 'browser',
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: [{name: 'local-adapters', setup(build) {
      build.onResolve({filter: /^next\/image$/}, () => ({path: 'link', namespace: 'stub'}));
      build.onResolve({filter: /^next\/link$/}, () => ({path: 'link', namespace: 'stub'}));
      build.onResolve({filter: /\/AssistantLink$/}, () => ({path: 'assistant', namespace: 'stub'}));
      build.onLoad({filter: /.*/, namespace: 'stub'}, args => ({loader: 'jsx', resolveDir: root, contents: args.path === 'link'
        ? 'export default function Link({children,...p}){return <a {...p}>{children}</a>}'
        : 'export function AssistantLink(){return null}'}));
    }}]
  });
  const server = http.createServer((req,res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if(req.method !== 'GET') {res.writeHead(405);return res.end();}
    if(url.pathname === '/stdin.js' || url.pathname === '/stdin.css') {
      res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');
      return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html><head><link rel="stylesheet" href="/stdin.css"></head><body><div id="root"></div><script src="/stdin.js"></script></body></html>');
  });
  server.listen(0,'127.0.0.1',()=>console.log('LOCAL_FIXTURE http://127.0.0.1:'+server.address().port));
})().catch(e=>{console.error(e);process.exitCode=1});
