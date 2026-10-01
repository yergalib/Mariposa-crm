"use client";
import { useState } from "react";
import type { PublicProductGroup, PublicVariant } from "@/lib/showroom/contracts";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";

export function ShowroomGroupCard({ item, disabled, onSelect }: {
  item: PublicProductGroup; disabled?: boolean; onSelect: (variant: PublicVariant) => void;
}) {
  const [variantId, setVariantId] = useState("");
  const selected = item.variants.find(variant => variant.id === variantId);
  return <article className="showroom-product"><PhotoPlaceholder /><div className="showroom-product-info">
    <h2>{item.name}</h2>
    {item.execution && <p>{item.execution}</p>}
    {item.color && <p>Цвет: {item.color}</p>}
    <label>Размер<select value={variantId} disabled={disabled} onChange={event => setVariantId(event.target.value)}>
      <option value="">Выберите размер</option>
      {item.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.size}</option>)}
    </select></label>
    {selected ? <><p>{priceText(selected.price)}</p><p className="showroom-availability">{selected.available
      ? "Доступно на выбранные даты · требует подтверждения"
      : "На эти даты недоступно · можно уточнить"}</p></>
      : <p className="showroom-availability">Выберите размер, чтобы увидеть его цену и наличие на выбранные даты.</p>}
    <button className="showroom-request" disabled={disabled || !selected} onClick={() => { if (selected) onSelect(selected); }}>Оставить заявку на бронь</button>
  </div></article>;
}
