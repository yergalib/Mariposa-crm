'use client';
import {useState} from 'react';
type Turn={id:string;state:string;envelope:unknown;history_reply:{message?:string}|null;delivery_state:string};
export default function TelegramOwnerPanel({branches}:{branches:{id:string;name:string}[]}){
  const [branch,setBranch]=useState(branches[0]?.id??''),[enrollment,setEnrollment]=useState(''),[command,setCommand]=useState(''),[identity,setIdentity]=useState(''),[consent,setConsent]=useState(false);
  const [turns,setTurns]=useState<Turn[]>([]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function json(path:string,body?:unknown){const response=await fetch('/api/telegram/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!response.ok)throw new Error('Операция не подтверждена. Не отправляйте повторно: сначала обновите состояние.');return response.json();}
  async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setNotice('');try{await action();}catch(e){setNotice(e instanceof Error?e.message:'Не подтверждено');}finally{setBusy(false);}}
  const refresh=async()=>{setTurns((await json('state')).turns);};
  return <section>
    <p>Только переписка владельца: без заявок, заказов и платежей.</p>
    <button disabled={busy} onClick={()=>run(async()=>{const r=await json('connect',{});setNotice(r.status==='connected'?'Telegram подключён. Теперь подтвердите свой чат.':'Подключение не подтверждено');})}>Подключить согласованный тестовый webhook</button>
    <p>Только ваш личный чат. Переписка подбора передаётся OpenAI и сохраняется в служебной истории. Не отправляйте секреты или контакты в чат ИИ.</p>
    <label>Филиал <select value={branch} disabled={busy} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <button disabled={busy||!branch} onClick={()=>run(async()=>{const r=await json('enrollment',{action:'start',branchId:branch});setEnrollment(r.enrollmentId);setCommand(r.command);setIdentity('');})}>Подготовить привязку</button>
    {command&&<p>Отправьте своему боту команду: <code>{command}</code>. Не передавайте её другим.</p>}
    <button disabled={busy||!enrollment} onClick={()=>run(async()=>{const r=await json('enrollment',{action:'inspect',enrollmentId:enrollment});setIdentity(r.senderId??'');setNotice(r.status);})}>Проверить личный чат</button>
    {identity&&<p>Telegram ID для привязки: {identity}. Подтверждайте только свой чат.</p>}
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Подтверждаю свой чат и согласен на OpenAI и сохранение истории подбора</label>
    <button disabled={busy||!identity||!consent} onClick={()=>run(async()=>{const r=await json('enrollment',{action:'confirm',enrollmentId:enrollment,consent:true});setNotice(r.status==='confirmed'?'Привязка подтверждена':'Не подтверждено');setCommand('');})}>Подтвердить привязку</button>
    <hr/><button disabled={busy} onClick={()=>run(refresh)}>Обновить состояние без вызова ИИ</button>
    {turns.map(turn=><article key={turn.id}><p>{turn.history_reply?.message??'Ответ ещё не подтверждён'}</p><p>Проверка: {turn.state}; доставка: {turn.delivery_state}</p>
      <button disabled={busy||!['review_ready','complete'].includes(turn.state)||turn.delivery_state!=='unsent'} onClick={()=>run(async()=>{await json('resume',{checkpointId:turn.id,update:turn.envelope});await refresh();})}>Завершить проверку и отправить один ответ</button>
    </article>)}
    <p role="status">{notice}</p>
  </section>;
}
