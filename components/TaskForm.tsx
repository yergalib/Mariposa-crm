"use client";
import { useState, useTransition } from "react";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { saveTaskAction, searchTaskReferences } from "@/app/tasks/actions";
import type { taskOptions } from "@/lib/tasks/service";

type Options = Awaited<ReturnType<typeof taskOptions>>;
export function TaskForm({ options, initial, creationKey }: { options: Options; creationKey?: string; initial?: {
  id: string; version: number; title: string; description: string; assignedMembershipId: string; dueAt: string;
  customerId: string; orderId: string; customerLabel?: string; orderLabel?: string;
} }) {
  const [customers, setCustomers] = useState(options.customers), [orders, setOrders] = useState(options.orders);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? ""), [orderId, setOrderId] = useState(initial?.orderId ?? "");
  const [query, setQuery] = useState(""), [message, setMessage] = useState(""), [pending, startTransition] = useTransition();
  if (!options.branch) return <p className="notice">Нет доступного филиала.</p>;
  const branchId = options.branch.id;
  const search = () => startTransition(async () => {
    const result = await searchTaskReferences(branchId, query);
    if ("error" in result) { setMessage(result.error ?? "Поиск недоступен."); return; }
    setCustomers(previous => [...previous.filter(row => row.id === customerId && !result.customers.some(next => next.id === row.id)), ...result.customers]);
    setOrders(previous => [...previous.filter(row => row.id === orderId && !result.orders.some(next => next.id === row.id)), ...result.orders]);
    setMessage(`Найдено клиентов: ${result.customers.length}, заказов: ${result.orders.length}. Максимум 51; уточните поиск при необходимости.`);
  });
  return <RetainedActionForm action={saveTaskAction} className="card form-grid task-form">
    <input type="hidden" name="branchId" value={branchId}/>
    {initial ? <><input type="hidden" name="id" value={initial.id}/><input type="hidden" name="version" value={initial.version}/></> : <input type="hidden" name="creationKey" value={creationKey}/>}
    <label>Название<input name="title" required maxLength={200} defaultValue={initial?.title}/></label>
    <label>Описание<textarea name="description" maxLength={4000} rows={4} defaultValue={initial?.description}/></label>
    <label>Ответственный<select name="assignedMembershipId" required defaultValue={initial?.assignedMembershipId ?? ""}><option value="" disabled>Выберите сотрудника</option>{options.assignees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label>Срок · {options.branch.timezone}<input type="datetime-local" name="dueAt" required defaultValue={initial?.dueAt}/></label>
    {(options.canCustomer || options.canOrder) && <div className="task-reference-search"><label>Найти связь по имени клиента или номеру заказа<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100}/></label><button type="button" className="secondary" onClick={search} disabled={pending}>{pending ? "Ищем…" : "Найти"}</button><p role="status">{message || "Связи необязательны. Показаны первые 51 записи; поиск сохраняет введённую задачу."}</p></div>}
    {options.canCustomer && <label>Клиент<select name="customerId" value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Без связи</option>{initial?.customerId && !customers.some(row => row.id === initial.customerId) && <option value={initial.customerId}>{initial.customerLabel}</option>}{customers.map(row => <option key={row.id} value={row.id}>{row.customerNumber} · {row.firstName} {row.lastName}</option>)}</select></label>}
    {options.canOrder && <label>Заказ<select name="orderId" value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Без связи</option>{initial?.orderId && !orders.some(row => row.id === initial.orderId) && <option value={initial.orderId}>{initial.orderLabel}</option>}{orders.map(row => <option key={row.id} value={row.id}>{row.orderNumber}</option>)}</select></label>}
    <button className="primary">{initial ? "Сохранить изменения" : "Создать задачу"}</button>
  </RetainedActionForm>;
}
