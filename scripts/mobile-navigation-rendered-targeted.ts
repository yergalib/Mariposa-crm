import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const passed:string[]=[];
const pass=(name:string,condition:unknown)=>{if(!condition)throw new Error(`FAIL ${name}`);passed.push(name)};
const browserCandidates=[process.env.CHROME_PATH,"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","/usr/bin/google-chrome","/usr/bin/chromium"].filter((value):value is string=>Boolean(value));
const browser=browserCandidates.find(existsSync);
if(!browser)throw new Error("Chrome/Edge executable not found. Set CHROME_PATH for rendered navigation checks.");

const styles=["globals.css","auth.css","catalog.css","customers.css","orders.css","calendar.css","purchases.css","design-system.css"].map(name=>readFileSync(join("app",name),"utf8")).join("\n");
const file=join(tmpdir(),`mariposa-mobile-navigation-${process.pid}.html`);
const entries=[["Главная","/"],["Заказы","/orders"],["Продажи","/sales"],["Возвраты","/returns"],["Календарь","/calendar"],["Товары","/products"],["Склад","/warehouse"],["Закупки","/purchases"],["Клиенты","/customers"],["Финансы","/finance"],["Чаты","/whatsapp"],["Настройки","/settings"]] as const;
const labels=entries.map(([label])=>label);
const links=(mode:"mobile"|"desktop")=>entries.map(([label,href])=>`<a href="${href}" data-sale="${href==="/sales"}" class="${mode==="mobile"?"mobile-nav-item":"nav-item"}${href==="/sales"?" active":""}"${href==="/sales"?' aria-current="page"':""}><span class="${mode==="mobile"?"mobile-nav-icon":"nav-icon"}">●</span><span class="${mode==="mobile"?"mobile-nav-label":""}">${label}</span></a>`).join("");
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div class="app-shell"><aside class="sidebar"><div class="sidebar-top"><a class="brand"><span class="brand-mark">M</span></a><div class="mobile-menu"><button class="mobile-menu-trigger">☰</button><div class="mobile-menu-panel"><nav class="mobile-nav-list">${links("mobile")}</nav><div class="mobile-organization-context"><form class="organization-switch"><label>Организация</label><div class="organization-switch-controls"><select><option>MARIPOSA — PILOT</option></select><button>Перейти</button></div></form></div></div></div></div><nav class="desktop-nav">${links("desktop")}</nav></aside></div><pre id="render-result"></pre><script>
if(location.hash==='#denied')document.querySelectorAll('[data-sale="true"]').forEach(element=>element.remove());
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
const labels=qa('.mobile-nav-label'),items=qa('.mobile-nav-item'),first=labels[0],menu=q('.mobile-menu'),panel=q('.mobile-menu-panel'),list=q('.mobile-nav-list'),org=q('.mobile-organization-context'),desktop=q('.desktop-nav'),s=getComputedStyle(first),i=getComputedStyle(items[0]),sale=qa('a[href="/sales"]');
q('#render-result').textContent=JSON.stringify({viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scrollX:window.scrollX,labelCount:labels.length,labels:labels.map(x=>x.textContent),labelRects:labels.map(rect),itemRects:items.map(rect),panelRect:rect(panel),orgRect:rect(org),selectRect:rect(q('select')),buttonRect:rect(q('.organization-switch-controls button')),gridColumns:getComputedStyle(list).gridTemplateColumns,display:s.display,visibility:s.visibility,opacity:s.opacity,fontSize:parseFloat(s.fontSize),itemDisplay:i.display,itemJustify:i.justifyContent,menuDisplay:getComputedStyle(menu).display,desktopDisplay:getComputedStyle(desktop).display,desktopLabelWidth:desktop.querySelector('span:last-child')?.getBoundingClientRect().width??0,saleCount:sale.length,saleActive:sale.every(x=>x.classList.contains('active')&&x.getAttribute('aria-current')==='page'),saleLabels:sale.map(x=>x.textContent.trim())});
</script></body></html>`;

type Box={left:number;right:number;top:number;bottom:number;width:number;height:number};
type Result={viewport:number;scrollWidth:number;scrollX:number;labelCount:number;labels:string[];labelRects:Box[];itemRects:Box[];panelRect:Box;orgRect:Box;selectRect:Box;buttonRect:Box;gridColumns:string;display:string;visibility:string;opacity:string;fontSize:number;itemDisplay:string;itemJustify:string;menuDisplay:string;desktopDisplay:string;desktopLabelWidth:number;saleCount:number;saleActive:boolean;saleLabels:string[]};
const inside=(box:Box,viewport:number)=>box.left>=-0.5&&box.right<=viewport+0.5&&box.width>0;

try{
  writeFileSync(file,html,"utf8");
  for(const width of [390,430,760,768,1024,1200]){
    const scale=width<485?500/width:1;const outerWidth=width<485?500:width+15;
    const output=execFileSync(browser,["--headless=new","--disable-gpu","--no-sandbox",`--force-device-scale-factor=${scale}`,`--window-size=${outerWidth},844`,"--dump-dom",`file:///${file.replaceAll("\\","/")}`],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
    const encoded=output.match(/<pre id="render-result">([^<]+)<\/pre>/)?.[1]?.replaceAll("&quot;",'"');
    if(!encoded)throw new Error(`No rendered result at ${width}px`);
    const result=JSON.parse(encoded) as Result;
    pass(`${width}px document has no horizontal overflow`,result.scrollWidth<=result.viewport&&result.scrollX===0);
    pass(`${width}px Sale route and active state are rendered`,result.saleCount===2&&result.saleActive&&result.saleLabels.every(label=>label==="●Продажи"));
    if(width<=1100){
      pass(`${width}px renders every label`,result.labelCount===labels.length&&labels.every(label=>result.labels.includes(label)));
      pass(`${width}px labels have visible geometry`,result.display!=="none"&&result.visibility==="visible"&&result.opacity==="1"&&result.fontSize>=12&&result.labelRects.every(box=>box.width>0&&box.height>0));
      pass(`${width}px panel is inside viewport`,inside(result.panelRect,result.viewport));
      pass(`${width}px every navigation item is inside viewport`,result.itemRects.every(box=>inside(box,result.viewport)&&box.height>=43.5));
      pass(`${width}px organization selector is inside viewport`,inside(result.orgRect,result.viewport)&&inside(result.selectRect,result.viewport)&&inside(result.buttonRect,result.viewport));
      pass(`${width}px items remain labeled flex rows`,result.itemDisplay==="flex"&&result.itemJustify==="flex-start"&&result.menuDisplay==="block");
      if(width<=760)pass(`${width}px phone menu has two columns`,result.gridColumns.trim().split(/\s+/).length===2);
    }else{
      pass(`${width}px mobile menu is hidden`,result.menuDisplay==="none");
      pass(`${width}px desktop navigation remains visible`,result.desktopDisplay==="flex"&&result.desktopLabelWidth>20);
    }
  }
  for(const width of [390,1200]){
    const scale=width<485?500/width:1,outerWidth=width<485?500:width+15;
    const output=execFileSync(browser,["--headless=new","--disable-gpu","--no-sandbox",`--force-device-scale-factor=${scale}`,`--window-size=${outerWidth},844`,"--dump-dom",`file:///${file.replaceAll("\\","/")}#denied`],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
    const encoded=output.match(/<pre id="render-result">([^<]+)<\/pre>/)?.[1]?.replaceAll("&quot;",'"');
    if(!encoded)throw new Error(`No denied rendered result at ${width}px`);
    const result=JSON.parse(encoded) as Result;
    pass(`${width}px permission denied hides Sale`,result.saleCount===0&&!result.labels.includes("Продажи"));
    pass(`${width}px permission denied keeps navigation usable`,result.scrollWidth<=result.viewport&&result.labelCount===labels.length-1);
  }
}finally{rmSync(file,{force:true})}
console.log(`MOBILE NAVIGATION rendered targeted: ${passed.length}/${passed.length} passed`);
