"use client";
import { useState } from "react";
import type { PublicBranch } from "@/lib/showroom/contracts";
import type { SelectionCriteria, SelectionStep } from "@/lib/assistant/selection";

export function GuidedSelection({ branches, criteria, onChange, onSearch, disabled, pending }: {
  branches: PublicBranch[]; criteria: SelectionCriteria;
  onChange: (key: keyof SelectionCriteria, value: string) => void;
  onSearch: (criteria: SelectionCriteria) => Promise<void>; disabled: boolean; pending: boolean;
}) {
  const [step, setStep] = useState<SelectionStep>("branch");
  const branch = branches.find(b => b.id === criteria.branchId);
  return <section className="showroom-guide" aria-label="Пошаговый подбор">
    <h2>Подберём вариант по вашим условиям</h2>
    <p>Это пошаговый подбор по каталогу, без свободного ИИ-чата. Цены и наличие проверяются в CRM, окончательно их подтвердит сотрудник.</p>
    <ol aria-label="Шаги подбора"><li aria-current={step === "branch" ? "step" : undefined}>Филиал{step !== "branch" && branch ? `: ${branch.city} — ${branch.name}` : ""}</li>
      <li aria-current={step === "size" ? "step" : undefined}>Размер{step === "dates" ? `: ${criteria.size || "не указан, показать все"}` : ""}</li>
      <li aria-current={step === "dates" ? "step" : undefined}>Даты и реальные варианты</li></ol>
    <form onSubmit={event => {
      event.preventDefault();
      if (disabled) return;
      if (step === "branch") setStep("size");
      else if (step === "size") setStep("dates");
      else void onSearch({ ...criteria, search: "" });
    }}>
      <fieldset disabled={disabled}>
        {step === "branch" && <><p>В каком филиале удобно получить платье?</p><label>Город / филиал<select required value={criteria.branchId} onChange={e => onChange("branchId", e.target.value)}>
          {branches.map(b => <option key={b.id} value={b.id}>{b.city} — {b.name}</option>)}
        </select></label></>}
        {step === "size" && <><p>Какой размер искать? Используйте обозначение размера, которое знаете. Если не уверены, покажем все размеры без догадок.</p>
          <label>Размер<input required maxLength={40} value={criteria.size} onChange={e => onChange("size", e.target.value)} /></label>
          <button type="button" onClick={() => { onChange("size", ""); setStep("dates"); }}>Не знаю размер — показать все</button></>}
        {step === "dates" && <><p>На какие даты нужна аренда? Время филиала: {branch?.timezone}. Будущий период до 31 дня; начало не далее года вперёд.</p>
          <label>Начало аренды<input required type="datetime-local" value={criteria.from} onChange={e => onChange("from", e.target.value)} /></label>
          <label>Конец аренды<input required type="datetime-local" value={criteria.until} onChange={e => onChange("until", e.target.value)} /></label>
          <p>Не вводите «завтра» или «на выходные»: выберите точные дату и время. Подбор ничего не бронирует.</p></>}
        <div className="showroom-pages">{step !== "branch" && <button type="button" onClick={() => setStep(step === "dates" ? "size" : "branch")}>Назад к условиям</button>}
          <button className="primary">{pending ? "Проверяем каталог…" : step === "dates" ? "Подобрать варианты" : "Далее"}</button></div>
      </fieldset>
    </form>
  </section>;
}
