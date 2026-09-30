"use client";

import { useState, type FormEvent } from "react";

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const DIRECT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function preparePhoto(file: File): Promise<File> {
  if (DIRECT_TYPES.has(file.type) && file.size <= MAX_REQUEST_BYTES) return file;
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name))
    throw new Error(`«${file.name}»: выберите изображение.`);

  let bitmap: ImageBitmap | null = null;
  let image: HTMLImageElement | null = null;
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      try { bitmap = await createImageBitmap(file); } catch { /* Safari can decode via an image element instead. */ }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      image = new Image();
      image.src = objectUrl;
      await image.decode();
    }
    const width = bitmap?.width ?? image!.naturalWidth;
    const height = bitmap?.height ?? image!.naturalHeight;
    if (!width || !height) throw new Error("Изображение не открылось.");
    const scale = Math.min(1, 2000 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось обработать фото.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap ?? image!, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_REQUEST_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") || "photo";
        return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
      }
    }
    throw new Error("Фото слишком большое даже после сжатия.");
  } catch {
    throw new Error(`«${file.name}»: не удалось подготовить фото. Выберите JPEG или измените формат камеры на «Наиболее совместимый».`);
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function PhotoUploadForm({ productId, executions }: { productId: string; executions: Array<{ id: string; name: string }> }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = [...(form.querySelector<HTMLInputElement>('input[type="file"]')?.files ?? [])];
    if (!files.length) return;
    if (files.length > 10) { setProgress("Выберите не больше 10 фото за раз."); return; }
    setBusy(true);
    let uploaded = 0;
    try {
      for (const [index, original] of files.entries()) {
        setProgress(`Подготовка фото ${index + 1} из ${files.length}…`);
        const file = await preparePhoto(original);
        const body = new FormData();
        body.set("files", file);
        body.set("executionId", String(data.get("executionId") ?? ""));
        body.set("altText", String(data.get("altText") ?? ""));
        setProgress(`Загрузка фото ${index + 1} из ${files.length}…`);
        const response = await fetch(`/products/${encodeURIComponent(productId)}/photos`, { method: "POST", headers: { Accept: "application/json" }, body });
        const result = await response.json() as { uploaded?: number; error?: string };
        if (!response.ok || result.error) throw new Error(result.error ?? "Не удалось загрузить фото.");
        uploaded++;
      }
      window.location.assign(`/products/${encodeURIComponent(productId)}?ok=${encodeURIComponent(`Загружено фото: ${uploaded}.`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить фото.";
      window.location.assign(`/products/${encodeURIComponent(productId)}?error=${encodeURIComponent(`Загружено ${uploaded} из ${files.length}. ${message}`)}`);
    }
  }

  return <form action={`/products/${productId}/photos`} method="post" encType="multipart/form-data" className="inline-form photo-upload-form" onSubmit={submit}>
    <input type="file" name="files" accept="image/*,.heic,.heif" multiple required title="До 10 фото; большие фото сжимаются перед загрузкой" disabled={busy}/>
    <select name="executionId" disabled={busy}><option value="">Фото товара</option>{executions.map(e => <option key={e.id} value={e.id}>Исполнение: {e.name}</option>)}</select>
    <input name="altText" placeholder="Описание фото" disabled={busy}/>
    <button className="primary" disabled={busy}>{busy ? "Загружается…" : "Загрузить"}</button>
    {progress && <p className="photo-upload-progress" role="status">{progress}</p>}
  </form>;
}
