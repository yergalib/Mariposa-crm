"use client";
import Image from "next/image";
import { useState } from "react";
import type { PublicPhoto } from "@/lib/showroom/contracts";
import { PhotoPlaceholder } from "./ShowroomPresentation";
export function ProductPhoto({ photo }: { photo?: PublicPhoto }) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return <PhotoPlaceholder />;
  return <div className="showroom-photo showroom-photo-with-image"><Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} unoptimized onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>;
}
export function ProductGallery({ images = [] }: { images?: PublicPhoto[] }) {
  const [selected, setSelected] = useState(0);
  return <div className={images.length < 2 ? "product-gallery product-gallery-single" : "product-gallery"} aria-label="Галерея товара"><ProductPhoto key={images[selected]?.id ?? "empty"} photo={images[selected]} />
    {images.length > 1 && <div className="product-gallery-slots">{images.map((photo, index) => <button type="button" key={photo.id} aria-label={`Показать фото ${index + 1}`} aria-pressed={index === selected} onClick={() => setSelected(index)}><ProductPhoto photo={photo} /></button>)}</div>}
  </div>;
}
