"use client";
import { useRef, useState, type FormEvent } from "react";
import type { PublicBranch, PublicVariant } from "@/lib/showroom/contracts";
import type { SelectionCriteria } from "@/lib/assistant/selection";
import { briefForStaff, readSelectionBrief, selectionShortlist, type SelectionBrief } from "@/lib/assistant/brief";
import { webSelectionAdapter } from "@/lib/assistant/web-adapter";
import { InquiryForm } from "./InquiryForm";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";
function Butterfly() {
  return <svg className="selection-butterfly" viewBox="0 0 240 160" aria-hidden="true" focusable="false"><g className="butterfly-left"><path d="M119 81C96 40 37 6 21 24C4 46 45 91 76 99C47 101 49 138 75 144C104 151 116 111 119 81Z" /></g><g className="butterfly-right"><path d="M121 81C144 40 203 6 219 24C236 46 195 91 164 99C193 101 191 138 165 144C136 151 124 111 121 81Z" /></g><path className="butterfly-body" d="M118 77Q120 70 122 77L123 115Q120 122 117 115Z" /><path className="butterfly-antennae" d="M119 78Q116 61 107 57M121 78Q124 61 133 57" /></svg>;
}
export function SelectionConsultation({ branches }: { branches: PublicBranch[] }) {
  const dialog = useRef<HTMLDialogElement>(null), resultHeading = useRef<HTMLHeadingElement>(null), sending = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<{ items: PublicVariant[]; criteria: SelectionCriteria; brief: SelectionBrief; more: boolean } | null>(null);
  const [selected, setSelected] = useState<PublicVariant | null>(null);
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const input = readSelectionBrief(new FormData(event.currentTarget));
    if (!input.criteria.size) { setError("Нужен точный размер. Возраст его не заменяет; если размер неизвестен, его поможет уточнить сотрудник."); return; }
    sending.current = true; setPending(true); setError("");
    try {
      const found = await webSelectionAdapter.findOptions(input.criteria, 1);
      const items = selectionShortlist(found.items);
      setResult({ items, criteria: input.criteria, brief: input.brief, more: found.more || found.items.length > items.length });
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Подбор временно недоступен."); }
    finally { sending.current = false; setPending(false); }
  }
  return <>
    <section className="selection-invitation" aria-label="Помощь с выбором платья"><p className="showroom-eyebrow">Особенный день начинается с образа</p><button className="selection-launch" aria-haspopup="dialog" aria-controls="selection-dialog" onClick={() => dialog.current?.showModal()}><Butterfly /><span>Подобрать платье</span><span className="selection-launch-hint">Расскажите о своих пожеланиях</span></button><p>Начните с подбора — или посмотрите каталог ниже.</p></section>
    <dialog id="selection-dialog" className="selection-dialog" ref={dialog} aria-labelledby="selection-title"><div className="selection-dialog-header"><span>MARIPOSA · Подбор образа</span><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Закрыть подбор и вернуться в каталог">Закрыть ×</button></div>
      <h2 id="selection-title">Расскажите, для кого и на какой праздник ищете образ</h2>
      <p className="selection-disclosure">Это форма подбора по каталогу, не ИИ-чат. Проверим точный размер и даты. Пожелания по цвету, поводу и бюджету передадим сотруднику вместе с заявкой — автоматического подбора по ним пока нет.</p>
      <p className="selection-retention">Можно закрыть окно и продолжить: ввод останется до обновления или перехода на другую страницу.</p>
      <form onSubmit={search} hidden={result !== null}><fieldset disabled={pending} className="selection-fields">
        <label className="selection-wide">Что вам хотелось бы?<textarea name="wishes" maxLength={240} rows={3} placeholder="Для кого выбираете образ, что нравится и что точно не подходит" /></label>
        <label>Возраст, если хотите уточнить<input name="age" maxLength={12} placeholder="Например, 8 лет" /></label>
        <label>Точный размер<input name="size" required maxLength={40} placeholder="Обозначение размера на одежде" /></label>
        <p className="selection-wide selection-note">Возраст не заменяет размер. Не указывайте имя ребёнка, дату рождения или другие личные сведения.</p>
        <label>Цвет или исполнение — пожелание<input name="color" maxLength={50} placeholder="Какой цвет нравится?" /></label><label>Повод — пожелание<input name="occasion" maxLength={60} placeholder="На какой праздник?" /></label>
        <label>Бюджет на весь образ, KZT<input name="budget" inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} placeholder="Необязательно" /></label>
        <label>Город / филиал<select name="branchId" required defaultValue={branches[0]?.id}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.city} — {branch.name} ({branch.timezone})</option>)}</select></label>
        <label>Начало аренды<input name="from" type="datetime-local" required /></label><label>Конец аренды<input name="until" type="datetime-local" required /></label>
        <label className="selection-wide">Название модели, если уже знаете<input name="search" maxLength={80} placeholder="Необязательно — поможет сузить выбор" /></label>
        <p className="selection-wide selection-note">Даты — по времени филиала. Если цена не указана, бюджет и стоимость комплекта сможет подтвердить только сотрудник. Обувь и аксессуары автоматически не предлагаем: их совместимость пока не описана.</p>
        <button className="primary selection-wide">{pending ? "Проверяем каталог…" : "Показать до 5 вариантов по размеру и датам"}</button>
      </fieldset></form>
      {error && <p role="alert">{error}</p>}
      {result && <section aria-label="Результаты подбора"><h3 ref={resultHeading} tabIndex={-1}>Варианты из каталога</h3><p>Размер {result.criteria.size} · {result.criteria.from.replace("T", " ")} — {result.criteria.until.replace("T", " ")}. Наличие требует подтверждения.</p>
        {!selected && <><button type="button" onClick={() => { setResult(null); setError(""); }}>Уточнить пожелания и условия</button>{!result.items.length && <p>По точному размеру и названию вариантов не найдено. Измените условия; другой размер автоматически не подставляем.</p>}
          {result.more && <p>Есть ещё варианты. Уточните название модели, чтобы сузить выбор; здесь показаны первые пять, а не персональный рейтинг.</p>}
          <div className="selection-results">{result.items.map(item => <article className="showroom-product" key={item.id}><PhotoPlaceholder /><div className="showroom-product-info"><h3>{item.name}</h3><p>{item.execution} · Размер {item.size}</p><p>{priceText(item.price)}</p><p>{item.available ? "Доступно на выбранные даты · требует подтверждения" : "На выбранные даты недоступно · можно уточнить у сотрудника"}</p><p className="selection-note">Показано по совпадению точного размера{result.criteria.search ? " и названия" : ""}. Цвет, повод и бюджет не проверены автоматически.</p><button onClick={() => setSelected(item)}>Выбрать для заявки</button></div></article>)}</div></>}
        {selected && <InquiryForm item={selected} filters={result.criteria} branchLabel={branches.find(branch => branch.id === result.criteria.branchId)?.name ?? ""} requestText={briefForStaff(result.brief)} onNewSearch={() => setSelected(null)} />}
      </section>}
    </dialog>
  </>;
}
