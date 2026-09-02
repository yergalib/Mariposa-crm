"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="primary" disabled={pending}>{pending ? "Назначение…" : "Назначить"}</button>;
}

export function BarcodeInput({ orderId, orderItemId, action }: { orderId: string; orderItemId: string; action: (data: FormData) => void | Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <form action={action} className="barcode-form">
    <input type="hidden" name="orderId" value={orderId} />
    <input type="hidden" name="orderItemId" value={orderItemId} />
    <label>Штрихкод экземпляра<input ref={ref} name="barcode" inputMode="text" autoComplete="off" enterKeyHint="done" required placeholder="Сканируйте или введите вручную" /></label>
    <Submit />
  </form>;
}
