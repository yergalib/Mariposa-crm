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
const labels=["Главная","Заказы","Возвраты","Календарь","Товары","Склад","Клиенты","Финансы","Чаты","Настройки"];
const links=labels.map((label,index)=>`<a class="mobile-nav-item${index===0?" active":""}"><span class="mobile-nav-icon">●</span><span class="mobile-nav-label">${label}</span></a>`).join("");
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div class="app-shell"><aside class="sidebar"><div class="sidebar-top"><a class="brand"><span class="brand-mark">M</span></a><div class="mobile-menu"><button class="mobile-menu-trigger">☰</button><div class="mobile-menu-panel"><nav class="mobile-nav-list">${links}</nav><div class="mobile-organization-context">MARIPOSA</div></div></div></div><nav class="desktop-nav"><a class="nav-item active"><span class="nav-icon">●</span><span id="desktop-label">Главная</span></a></nav></aside></div><pre id="render-result"></pre><script>const labels=[...document.querySelectorAll('.mobile-nav-label')];const first=labels[0],item=first.parentElement,menu=document.querySelector('.mobile-menu'),desktop=document.querySelector('.desktop-nav'),s=getComputedStyle(first),i=getComputedStyle(item);document.querySelector('#render-result').textContent=JSON.stringify({labelCount:labels.length,labels:labels.map(x=>x.textContent),display:s.display,visibility:s.visibility,opacity:s.opacity,fontSize:parseFloat(s.fontSize),width:first.getBoundingClientRect().width,itemDisplay:i.display,itemJustify:i.justifyContent,itemWidth:item.getBoundingClientRect().width,menuDisplay:getComputedStyle(menu).display,desktopDisplay:getComputedStyle(desktop).display,desktopLabelWidth:document.querySelector('#desktop-label').getBoundingClientRect().width})</script></body></html>`;

try{
  writeFileSync(file,html,"utf8");
  for(const width of [390,430,760,768,1024,1200]){
    const output=execFileSync(browser,["--headless=new","--disable-gpu","--no-sandbox",`--window-size=${width},844`,"--dump-dom",`file:///${file.replaceAll("\\","/")}`],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
    const encoded=output.match(/<pre id="render-result">([^<]+)<\/pre>/)?.[1]?.replaceAll("&quot;",'"');
    if(!encoded)throw new Error(`No rendered result at ${width}px`);
    const result=JSON.parse(encoded) as {labelCount:number;labels:string[];display:string;visibility:string;opacity:string;fontSize:number;width:number;itemDisplay:string;itemJustify:string;itemWidth:number;menuDisplay:string;desktopDisplay:string;desktopLabelWidth:number};
    if(width<=1100){
      pass(`${width}px renders every label`,result.labelCount===labels.length&&labels.every(label=>result.labels.includes(label)));
      pass(`${width}px label is visibly laid out`,result.display!=="none"&&result.visibility==="visible"&&result.opacity==="1"&&result.fontSize>=12&&result.width>20);
      pass(`${width}px item is labeled flex row`,result.itemDisplay==="flex"&&result.itemJustify==="flex-start"&&result.itemWidth>100&&result.menuDisplay==="block");
    }else{
      pass(`${width}px mobile menu is hidden`,result.menuDisplay==="none");
      pass(`${width}px desktop navigation remains visible`,result.desktopDisplay==="flex"&&result.desktopLabelWidth>20);
    }
  }
}finally{rmSync(file,{force:true})}
console.log(`MOBILE NAVIGATION rendered targeted: ${passed.length}/${passed.length} passed`);
