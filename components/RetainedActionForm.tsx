"use client";
import {useActionState, useRef, type ComponentProps, type ReactNode} from "react";
export type FormResult = {error:string} | void;
export type RetainedFormAction = (form:FormData)=>Promise<FormResult>;
/** Success actions redirect. Validation errors leave the native draft and its replay key intact. */
export function RetainedActionForm({action,children,...props}:Omit<ComponentProps<"form">,"action">&{action:RetainedFormAction;children:ReactNode}) {
  const submitting=useRef(false);
  const [state,submit,pending]=useActionState(async (_state:FormResult,form:FormData)=>{
    try{return await action(form)}finally{submitting.current=false}
  },undefined);
  return <form {...props} action={submit} aria-busy={pending} onReset={event=>event.preventDefault()} onSubmit={event=>{if(submitting.current){event.preventDefault();return;}submitting.current=true;props.onSubmit?.(event);if(event.defaultPrevented)submitting.current=false;}}>
    {state?.error&&<p role="alert" className="notice error" style={{gridColumn:"1 / -1"}}>{state.error}</p>}
    <fieldset disabled={pending} style={{display:"contents"}}>{children}</fieldset>
  </form>;
}
