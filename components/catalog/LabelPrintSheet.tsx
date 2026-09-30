"use client";

import { useState } from "react";
import Barcode from "react-barcode";

export type PrintableLabel = { id: string; code: string; name: string; description: string };

export function LabelPrintSheet({ labels }: { labels: PrintableLabel[] }) {
  const [selected, setSelected] = useState(() => new Set(labels.map(label => label.id)));
  const [copies, setCopies] = useState(1);
  const chosen = labels.filter(label => selected.has(label.id));
  const count = chosen.length * copies;

  return <>
    <section className="label-print-controls">
      <div className="label-print-toolbar"><strong>Выбрано: {chosen.length} из {labels.length}</strong><button type="button" className="secondary" onClick={() => setSelected(new Set(labels.map(label => label.id)))}>Выбрать все</button><button type="button" className="secondary" onClick={() => setSelected(new Set())}>Снять выбор</button><label>Копий каждой <input type="number" min="1" max="5" value={copies} onChange={event => setCopies(Math.min(5, Math.max(1, Number(event.target.value) || 1)))}/></label><button type="button" className="primary" disabled={!count || count > 200} onClick={() => window.print()}>Печатать · {count}</button></div>
      {count > 200 && <p className="notice error">За один раз можно подготовить не больше 200 этикеток. Уменьшите число копий или выберите часть кодов.</p>}
      {!labels.length && <p>Для этого товара пока нет активных кодов для печати.</p>}
      <div className="label-print-options">{labels.map(label => <label key={label.id}><input type="checkbox" checked={selected.has(label.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(label.id); else next.delete(label.id); return next; })}/><span><b>{label.description || label.name}</b><small>{label.code}</small></span></label>)}</div>
    </section>
    {count > 0 && count <= 200 && <section className="label-print-sheet" aria-label="Предпросмотр этикеток">{chosen.flatMap(label => Array.from({ length: copies }, (_, index) => <article className="printed-label" key={`${label.id}-${index}`}><strong>MARIPOSA</strong><div className="printed-label-name">{label.name}</div><div className="printed-label-description">{label.description}</div><div className="printed-label-barcode"><Barcode value={label.code} format="CODE128" width={1} height={34} displayValue={false} margin={0}/></div><small>{label.code}</small></article>))}</section>}
  </>;
}
