"use client";

import { useState } from "react";

export function CopyInquiryReply({text}:{text:string}){
  const [status,setStatus]=useState("");
  return <div className="inquiry-reply">
    <label>Текст для клиента<textarea readOnly rows={7} value={text} onFocus={event=>event.currentTarget.select()}/></label>
    <button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(text);setStatus("Скопировано. Проверьте текст перед отправкой.");}catch{setStatus("Выделите текст выше и скопируйте вручную.");}}}>Скопировать ответ</button>
    {status&&<small role="status">{status}</small>}
  </div>;
}
