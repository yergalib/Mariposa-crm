// Keep the desktop path unchanged. iOS gets a complete, asset-free top-level
// document instead of asking Safari to print the current streamed app document.
export function usesIOSPrinting(navigator: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">) {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const sheetStyle = `
body{margin:0;padding:16px;color:#202126;background:white;font:14px Arial,sans-serif}
nav{margin-bottom:16px}button{font:inherit;min-height:44px;padding:10px 20px;cursor:pointer}
.label-print-sheet{display:grid;grid-template-columns:repeat(2,92mm);gap:3mm}
.printed-label{box-sizing:border-box;width:92mm;height:37mm;overflow:hidden;border:1px solid #bbb;padding:3mm 4mm;display:flex;flex-direction:column;align-items:center;text-align:center;line-height:1.1;break-inside:avoid;page-break-inside:avoid}
.printed-label>strong{font-family:Georgia,serif;letter-spacing:.13em;font-size:10px;color:#793149}
.printed-label-name{font-weight:700;font-size:12px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-top:2px}
.printed-label-description{font-size:10px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin-top:2px}
.printed-label-barcode{flex:1;min-height:0;display:flex;align-items:flex-end;justify-content:center;width:100%;overflow:hidden}
.printed-label-barcode svg{display:block;max-width:100%;height:auto;max-height:100%}
.printed-label>small{font-size:9px;letter-spacing:.03em;margin-top:1px;overflow-wrap:anywhere}
@media screen and (max-width:640px){.label-print-sheet{grid-template-columns:minmax(0,1fr)}.printed-label{max-width:100%}}
@media print{@page{size:A4;margin:9mm}body{padding:0}nav{display:none!important}.printed-label{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export function printLabelSheet(sheet: HTMLElement | null, source: Window = window): string | null {
  if (!usesIOSPrinting(source.navigator)) {
    source.print();
    return null;
  }

  const labels = sheet ? Array.from(sheet.querySelectorAll<HTMLElement>(".printed-label")) : [];
  if (!labels.length || labels.length > 200 || labels.some(label => !label.querySelector("svg rect"))) {
    return "Штрихкоды ещё не готовы. Дождитесь появления этикеток и нажмите «Печатать» снова.";
  }

  // No await, timer, fetch or iframe: opening stays inside the user's click.
  const target = source.open("about:blank", "_blank");
  if (!target) return "Safari не открыл лист печати. Разрешите всплывающие окна для CRM и повторите нажатие.";
  target.opener = null;

  try {
    const doc = target.document;
    doc.open();
    doc.write("<!doctype html><html lang='ru'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>MARIPOSA — этикетки</title></head><body></body></html>");
    const style = doc.createElement("style");
    style.textContent = sheetStyle;
    doc.head.append(style);
    const controls = doc.createElement("nav");
    const retry = doc.createElement("button");
    retry.type = "button";
    retry.textContent = "Печатать этикетки";
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "Лист готов. Если окно печати не открылось, нажмите «Печатать этикетки». После печати можно закрыть эту вкладку.";
    const print = () => {
      try { target.focus(); target.print(); }
      catch { status.textContent = "Safari не открыл окно печати. Нажмите «Печатать этикетки» ещё раз."; }
    };
    retry.addEventListener("click", print);
    controls.append(retry, status);
    const snapshot = doc.createElement("section");
    snapshot.className = "label-print-sheet";
    snapshot.setAttribute("aria-label", "Этикетки для печати");
    // Clone only rendered labels, never re-parse product text as HTML or copy
    // application scripts/styles/credentials. Inline SVG needs no asset loading.
    for (const label of labels) snapshot.append(doc.importNode(label, true));
    doc.body.append(controls, snapshot);
    doc.close();
    print();
    // Safari print() is not a reliable completion signal. Do not auto-close.
    return null;
  } catch {
    target.close();
    return "Не удалось подготовить лист этикеток. Повторите нажатие «Печатать».";
  }
}
