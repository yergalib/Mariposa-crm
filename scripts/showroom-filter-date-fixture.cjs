// Local-only real React fixture. Synthetic data, no DB/provider/POST routes.
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-dates-'));
(async () => {
  await esbuild.build({
    absWorkingDir: root, stdin: {resolveDir: root, loader: 'tsx', contents: `
      import './app/globals.css'; import './app/showroom/showroom.css'; import './app/showroom/site.css'; import React from 'react'; import {createRoot} from 'react-dom/client';
      import {CatalogAvailability} from './app/showroom/CatalogAvailability';
      const filters=Object.fromEntries(new URLSearchParams(location.search));
      createRoot(document.getElementById('root')).render(<><h1>Local synthetic catalogue filter</h1>
        <pre aria-label="Submitted query">{JSON.stringify(filters)}</pre>
        <CatalogAvailability branches={[{id:'11111111-1111-4111-8111-111111111111',name:'Synthetic',city:'Synthetic',timezone:'Asia/Almaty'}]} categories={[]} filters={filters}>
          <p>No stock or availability claims in this fixture.</p>
        </CatalogAvailability></>);
    `}, outdir: out, bundle: true, jsx: 'automatic', platform: 'browser',
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: [{name: 'local-adapters', setup(build) {
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
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stdin.css"></head><body><div id="root" class="showroom"></div><script src="/stdin.js"></script></body></html>');
  });
  server.listen(0,'127.0.0.1',()=>console.log('LOCAL_FIXTURE http://127.0.0.1:'+server.address().port));
})().catch(e=>{console.error(e);process.exitCode=1});
