"use client";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { PublicPhoto } from "@/lib/showroom/contracts";
import { PhotoPlaceholder } from "./ShowroomPresentation";
export function ProductPhoto({ photo }: { photo?: PublicPhoto }) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return <PhotoPlaceholder />;
  return <div className="showroom-photo showroom-photo-with-image"><Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} unoptimized onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>;
}
function motionSubscribe(callback: () => void) { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
export function ProductGallery({ images = [] }: { images?: PublicPhoto[] }) {
  const reduced = useSyncExternalStore(motionSubscribe, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const [viewport, api] = useEmblaCarousel({ loop: false, duration: reduced ? 0 : 25 });
  const subscribe = useCallback((listener: () => void) => { if (!api) return () => {}; api.on("select", listener).on("reInit", listener); return () => { api.off("select", listener).off("reInit", listener); }; }, [api]);
  const selected = useSyncExternalStore(subscribe, () => api?.selectedScrollSnap() ?? 0, () => 0);
  if (!images.length) return <div className="product-gallery product-gallery-single"><PhotoPlaceholder /></div>;
  return <div className="product-gallery product-gallery-single" role="region" aria-label="Галерея товара" aria-roledescription="карусель">
    <div className="product-gallery-viewport" ref={viewport} tabIndex={0} aria-label="Фотографии товара. Стрелки влево и вправо переключают фото" onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); api?.scrollTo(selected + (e.key === "ArrowRight" ? 1 : -1), reduced); } }}>
      <div className="product-gallery-track">{images.map((photo,index) => <div className="product-gallery-slide" key={photo.id} aria-hidden={index !== selected}><ProductPhoto photo={photo} /></div>)}</div>
    </div>
    {images.length > 1 && <><p className="gallery-position" aria-live="polite">Фото {selected + 1} из {images.length}</p><div className="product-gallery-slots">{images.map((photo, index) => <button type="button" key={photo.id} aria-label={`Показать фото ${index + 1}`} aria-pressed={index === selected} onClick={() => api?.scrollTo(index, reduced)}><ProductPhoto photo={photo} /></button>)}</div></>}
  </div>;
}
