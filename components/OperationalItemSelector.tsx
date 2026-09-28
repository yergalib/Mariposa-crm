"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { resolveCatalogIdentifierAction, searchOperationalItemsAction } from "@/app/scan-actions";
import type { OperationalIdentifierResult, OperationalSearchHit, SafeSize } from "@/lib/inventory/operational-contract";
import type { CameraDecoderSession, CameraFailure } from "@/lib/scanning/camera-adapter";

const cameraMessages: Record<CameraFailure,string> = { PERMISSION_DENIED: "Доступ к камере запрещён. Разрешите камеру в настройках Safari или введите код вручную.", UNSUPPORTED: "Камера недоступна в этом браузере. Введите код вручную.", UNAVAILABLE: "Не удалось открыть камеру. Возможно, она занята другим приложением." };
const sizeLabel=(size:SafeSize)=>size.sizeSystem==="ONE_SIZE"?"Без размера":size.sizeSystem==="VOLUME_ML"?`${size.code} мл`:size.recommendedHeightCm?`${size.code} · рост ${size.recommendedHeightCm} см`:size.lengthCm?`${size.code} · ${size.lengthCm} см`:size.name||size.code;

export function OperationalItemSelector({triggerLabel="Сканировать",compact=false}:{triggerLabel?:string;compact?:boolean}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[result,setResult]=useState<OperationalIdentifierResult|null>(null),[hits,setHits]=useState<OperationalSearchHit[]>([]),[message,setMessage]=useState(""),[cameraState,setCameraState]=useState<"idle"|"starting"|"active">("idle");
  const [pending,startTransition]=useTransition(); const videoRef=useRef<HTMLVideoElement>(null),sessionRef=useRef<CameraDecoderSession|null>(null),acceptedRef=useRef(false),lastSubmitRef=useRef<{value:string;at:number}>({value:"",at:0});
  const stopCamera=useCallback(()=>{sessionRef.current?.stop();sessionRef.current=null;setCameraState("idle");},[]);
  const close=useCallback(()=>{stopCamera();setOpen(false);setResult(null);setHits([]);setMessage("");},[stopCamera]);
  const resolve=useCallback((raw:string)=>{const value=raw.trim(),now=Date.now();if(!value||pending||(lastSubmitRef.current.value===value&&now-lastSubmitRef.current.at<1200))return;lastSubmitRef.current={value,at:now};acceptedRef.current=true;stopCamera();setMessage("");setHits([]);startTransition(async()=>{const response=await resolveCatalogIdentifierAction(value);if(!response.ok){setMessage(response.message);return;}setResult(response.result);if(response.result.kind==="NOT_FOUND")setMessage("Код не найден. Проверьте код или найдите товар по названию.");else if(response.result.kind==="NOT_AVAILABLE")setMessage("Товар найден, но сейчас недоступен для операций.");else if(response.result.kind==="AMBIGUOUS_IDENTIFIER")setMessage("Код неоднозначен. Обратитесь к администратору каталога.");});},[pending,stopCamera]);
  const startCamera=useCallback(async()=>{stopCamera();acceptedRef.current=false;setMessage("");setCameraState("starting");try{const {createCameraDecoderAdapter}=await import("@/lib/scanning/zxing-camera-adapter");if(!videoRef.current)return;sessionRef.current=await createCameraDecoderAdapter().start(videoRef.current,value=>{if(acceptedRef.current)return;acceptedRef.current=true;setQuery(value);resolve(value)});setCameraState("active")}catch(error){setCameraState("idle");const failure=(error as {cameraFailure?:CameraFailure}).cameraFailure??"UNAVAILABLE";setMessage(cameraMessages[failure])}},[resolve,stopCamera]);
  useEffect(()=>{const pagehide=()=>stopCamera(),visibility=()=>{if(document.hidden)stopCamera()};window.addEventListener("pagehide",pagehide);document.addEventListener("visibilitychange",visibility);return()=>{window.removeEventListener("pagehide",pagehide);document.removeEventListener("visibilitychange",visibility);stopCamera()}},[stopCamera]);
  const search=()=>startTransition(async()=>{setResult(null);setMessage("");const response=await searchOperationalItemsAction(query);if(response.ok)setHits(response.results);else setMessage(response.message)});
  return <>
    <button type="button" className={compact?"scan-trigger compact":"scan-trigger"} onClick={()=>setOpen(true)} aria-haspopup="dialog">⌁ <span>{triggerLabel}</span></button>
    {open&&<div className="scanner-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close()}}><section className="scanner-sheet" role="dialog" aria-modal="true" aria-label="Поиск и сканирование товара">
      <header><div><strong>Найти товар</strong><small>Код, сканер или камера</small></div><button type="button" onClick={close} aria-label="Закрыть">×</button></header>
      <div className="camera-stage"><video ref={videoRef} muted playsInline/><span className="camera-frame"/><p>{cameraState==="starting"?"Открываем камеру…":cameraState==="active"?"Наведите камеру на штрихкод":"Камера выключена"}</p></div>
      <button type="button" className="primary camera-button" onClick={cameraState==="active"?stopCamera:startCamera} disabled={cameraState==="starting"}>{cameraState==="active"?"Остановить камеру":"Открыть камеру"}</button>
      <form className="scanner-input" onSubmit={event=>{event.preventDefault();resolve(query)}}><label>Код / SKU / штрихкод<input autoFocus value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Tab"&&query.trim()){event.preventDefault();resolve(query)}}} autoComplete="off" inputMode="text" placeholder="Введите или отсканируйте код"/></label><button className="secondary" disabled={pending}>Найти код</button></form>
      <button type="button" className="scanner-name-search" onClick={search} disabled={pending||query.trim().length<2}>Искать по названию</button>
      {message&&<p className="scanner-message" role="status">{message}</p>}
      {result&&<ResolvedResult result={result}/>} 
      {hits.length>0&&<div className="scanner-results" aria-label="Результаты поиска">{hits.map(hit=><Link key={`${hit.product.id}-${hit.variant?.id??"product"}`} href={`/products/${hit.product.id}`} onClick={stopCamera}><strong>{hit.product.name}</strong><span>{hit.variant?.execution?.name}{hit.variant?.execution?" · ":""}{hit.variant?sizeLabel(hit.variant.size):"Открыть товар"}</span>{hit.variant&&<small>SKU {hit.variant.sku}</small>}</Link>)}</div>}
      <p className="scanner-privacy">Видео обрабатывается только на устройстве и не загружается.</p>
    </section></div>}
  </>;
}

function ResolvedResult({result}:{result:OperationalIdentifierResult}){
  if(result.kind==="NOT_FOUND"||result.kind==="NOT_AVAILABLE"||result.kind==="AMBIGUOUS_IDENTIFIER")return null;
  if(result.kind==="PRODUCT_NEEDS_VARIANT_SELECTION")return <div className="scanner-result-card"><strong>{result.product.name}</strong><span>Выберите вариант</span><div className="scanner-variants">{result.variants.map(variant=><Link key={variant.id} href={`/products/${result.product.id}?variant=${variant.id}`}>{variant.execution?.name&&<b>{variant.execution.name} · </b>}{sizeLabel(variant.size)}</Link>)}</div><Link href={`/products/${result.product.id}`}>Открыть товар</Link></div>;
  return <div className="scanner-result-card"><strong>{result.product.name}</strong><span>{result.execution?.name&&`${result.execution.name} · `}{sizeLabel(result.variant.size)}</span><small>{result.kind==="SERIALIZED_INSTANCE"?`Экземпляр ${result.instance.inventoryNumber} · ${result.instance.barcode}`:`SKU ${result.variant.sku}`}</small><Link href={`/products/${result.product.id}`}>Открыть товар</Link></div>;
}
