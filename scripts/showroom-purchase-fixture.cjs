// Loopback-only actual React components. Synthetic data and requests; no CRM/network.
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'purchase-ui-'));
(async()=>{
await esbuild.build({absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {Showroom} from './app/showroom/Showroom';import {CatalogModeSwitch} from './app/showroom/CatalogModeSwitch';import {PurchaseProductDetail} from './app/showroom/PurchaseProductDetail';import {ShowroomProductDetail} from './app/showroom/ShowroomProductDetail';import {InquiryAccessProvider} from './app/showroom/InquiryAccess';import {TabState} from './app/showroom/TabState';
import "./app/globals.css";
import "./app/auth.css";
import "./app/catalog.css";
import "./app/labels.css";
import "./app/customers.css";
import "./app/orders.css";
import "./app/calendar.css";
import "./app/purchases.css";
import "./app/design-system.css";
import "./app/scanner.css";
import "./app/fittings.css";
import "./app/workspace-refresh.css";
import './app/showroom/showroom.css';import './app/showroom/site.css';
const branch='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const params=Object.fromEntries(new URLSearchParams(location.search)),filters={mode:'rental',search:'',categoryId:'',page:1,branchId:branch,...params};
const amount=filters.mode==='purchase'?'32000':'5000';
const product={id,productId:id,executionId:null,name:'Платье — тестовый пример',colorLabel:'Белый',color:'белый',execution:null,sizes:['Размер 13 · рост 140 см'],priceBranchId:branch,priceSummary:{minAmountMinor:amount,maxAmountMinor:amount,currency:'KZT',incomplete:false},images:[{id:'photo',src:'/brand/hero/color-white-large.webp',alt:'Разрешённое фото MARIPOSA; тестовый товар',width:800,height:1200}],options:[{id,size:'Размер 13 · рост 140 см',price:{amountMinor:amount,currency:'KZT'}},{id:'55555555-5555-4555-8555-555555555555',size:'Нет цены',price:null},{id:'66666666-6666-4666-8666-666666666666',size:'Нет наличия',price:{amountMinor:amount,currency:'KZT'}}]};
const branches=[{id:branch,name:'Тестовый филиал',city:'Тест',timezone:'UTC'}];
let posts=0;window.fetch=async(url,options={})=>{if(options.method==='POST'){posts++;document.getElementById('calls').textContent='Тестовых отправок: '+posts;const body=JSON.parse(options.body);document.getElementById('payload').textContent=JSON.stringify(body);await new Promise(r=>setTimeout(r,700));return new Response(JSON.stringify({ok:true,inquiryId:'LOCAL-MOCK-ONLY'}),{status:200})}const p=new URL(String(url),location.href).searchParams;const chosen=product.options.find(x=>x.id===p.get('variantId'));return new Response(JSON.stringify({id:chosen.id,name:product.name,execution:null,size:chosen.size,price:chosen.price,available:!chosen.size.includes('наличия')}),{status:200})};
createRoot(document.getElementById('root')).render(<TabState scope="purchase-fixture" deadline={Date.now()+3600000}><InquiryAccessProvider enabled><header style={{padding:16,borderBottom:'1px solid #ddd'}}><b>MARIPOSA</b><p>Локальная проверка реальных компонентов. Товары и цены — примеры. Заявки только mock.</p><output id="calls">Тестовых отправок: 0</output><details><summary>Тестовый запрос</summary><pre id="payload"/></details></header><main className="showroom">{params.productId?<><a href={'/showroom?view=catalog&mode='+filters.mode}>Назад в каталог</a><CatalogModeSwitch filters={filters}/>{filters.mode==='purchase'?<PurchaseProductDetail product={product} branches={branches} initialCriteria={filters}/>:<ShowroomProductDetail product={product} branches={branches} initialCriteria={filters}/>}</>:<Showroom catalog={{items:[product],page:1,more:false}} branches={branches} categories={[]} filters={filters}/>}</main></InquiryAccessProvider></TabState>);
`},outdir:out,bundle:true,jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-next-adapters',setup(build){build.onResolve({filter:/^next\/(link|image)$/},a=>({path:a.path,namespace:'stub'}));build.onResolve({filter:/\/AssistantLink$/},()=>({path:'assistant',namespace:'stub'}));build.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='next/image'?'export default function Image({unoptimized,...props}){return <img {...props}/>}':a.path==='next/link'?'export default function Link({children,...props}){return <a {...props}>{children}</a>}':'export function AssistantLink(){return null}'}))}}]});
http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET'){res.writeHead(405);return res.end()}
if(['/stdin.js','/stdin.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))))}
if(url.pathname==='/brand/hero/color-white-large.webp'){res.setHeader('Content-Type','image/webp');return res.end(fs.readFileSync(path.join(root,'public',url.pathname)))}
res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stdin.css"><div id="root"></div><script src="/stdin.js"></script></html>')}).listen(Number(process.env.PURCHASE_FIXTURE_PORT||8876),'127.0.0.1',()=>console.log('LOCAL PURCHASE FIXTURE port '+(process.env.PURCHASE_FIXTURE_PORT||8876)));
})().catch(e=>{console.error(e);process.exitCode=1});
