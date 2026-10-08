"use client";

import { useId, useRef, type ReactNode } from "react";

/** Forms stay mounted so validation errors and entered values survive reopening. */
export function ContextPanel({ title, trigger, children, primary = false }: { title: string; trigger?: string; children: ReactNode; primary?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  return <div className="context-panel">
    <button type="button" className={primary ? "primary" : "secondary"} onClick={() => dialog.current?.showModal()}>{trigger ?? title}</button>
    <dialog ref={dialog} className="context-dialog" aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="context-dialog-body"><header><h2 id={titleId}>{title}</h2><button type="button" className="context-close" aria-label="Закрыть" onClick={() => dialog.current?.close()}>×</button></header>{children}</div>
    </dialog>
  </div>;
}
