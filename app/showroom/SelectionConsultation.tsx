"use client";
import { useRef, useState, type FormEvent } from "react";
import type { PublicBranch, PublicVariant } from "@/lib/showroom/contracts";
import type { SelectionCriteria } from "@/lib/assistant/selection";
import { briefForStaff, readSelectionBrief, selectionShortlist, type SelectionBrief } from "@/lib/assistant/brief";
import { broadenColor, supportedColors } from "@/lib/assistant/colors";
import { webSelectionAdapter } from "@/lib/assistant/web-adapter";
import { InquiryForm } from "./InquiryForm";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";
import { Butterfly } from "./Butterfly";
export function SelectionConsultation({ branches }: { branches: PublicBranch[] }) {
  const dialog = useRef<HTMLDialogElement>(null), resultHeading = useRef<HTMLHeadingElement>(null), sending = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<{ items: PublicVariant[]; criteria: SelectionCriteria; brief: SelectionBrief; more: boolean; broadened: boolean } | null>(null);
  const [selected, setSelected] = useState<PublicVariant | null>(null);
  async function find(input: { criteria: SelectionCriteria; brief: SelectionBrief }, broadened = false) {
    if (sending.current) return;
    sending.current = true; setPending(true); setError("");
    try {
      const found = await webSelectionAdapter.findOptions(input.criteria, 1);
      const items = selectionShortlist(found.items);
      setResult({ items, criteria: { ...input.criteria, color: found.appliedColor ?? input.criteria.color ?? "" }, brief: input.brief, more: found.more || found.items.length > items.length, broadened });
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Подбор временно недоступен."); }
    finally { sending.current = false; setPending(false); }
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    try {
      const input = readSelectionBrief(new FormData(event.currentTarget));
      if (!input.criteria.size) throw new Error("Нужен точный размер. Возраст его не заменяет; если размер неизвестен, его поможет уточнить сотрудник.");
      await find(input);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Уточните условия подбора."); }
  }  return <>
    <section className="selection-invitation" aria-label="Помощь с выбором платья"><p className="showroom-eyebrow">Особенный день начинается с образа</p><button className="selection-launch" aria-haspopup="dialog" aria-controls="selection-dialog" onClick={() => dialog.current?.showModal()}><Butterfly /><span>Подобрать платье</span><span className="selection-launch-hint">Расскажите о своих пожеланиях</span></button><p>Начните с подбора — или посмотрите каталог ниже.</p></section>
    <dialog id="selection-dialog" className="selection-dialog" ref={dialog} aria-labelledby="selection-title"><div className="selection-dialog-header"><span>MARIPOSA · Подбор образа</span><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Закрыть подбор и вернуться в каталог">Закрыть ×</button></div>
      <h2 id="selection-title">Расскажите, для кого и на какой праздник ищете образ</h2>
      <p className="selection-disclosure">Это форма подбора по каталогу, не ИИ-чат. Применим точный размер и указанный цвет; проверим наличие на даты. Повод, бюджет и остальные пожелания не являются фильтрами — их уточнит сотрудник.</p>
      <p className="selection-retention">Можно закрыть окно и продолжить: ввод останется до обновления или перехода на другую страницу.</p>
      <form onSubmit={search} hidden={result !== null}><fieldset disabled={pending} className="selection-fields">
        <label className="selection-wide">Что вам хотелось бы?<textarea name="wishes" maxLength={240} rows={3} placeholder="Для кого выбираете образ. Цвет укажите также в отдельном поле; остальные пожелания — сотруднику" /></label>
        <label>Возраст, если хотите уточнить<input name="age" maxLength={12} placeholder="Например, 8 лет" /></label>
        <label>Точный размер<input name="size" required maxLength={40} placeholder="Обозначение размера на одежде" /></label>
        <p className="selection-wide selection-note">Возраст не заменяет размер. Не указывайте имя ребёнка, дату рождения или другие личные сведения.</p>
        <label>Цвет — обязательный фильтр<input name="color" required maxLength={50} list="selection-colors" placeholder="Например, жёлтый; любой — без фильтра" /><datalist id="selection-colors"><option value="любой" />{supportedColors.map(color => <option key={color} value={color} />)}</datalist><span className="selection-note">Один цвет, включая сочетания с ним. Неизвестный цвет уточним, а не заменим.</span></label><label>Повод — пожелание, не фильтр<input name="occasion" maxLength={60} placeholder="На какой праздник?" /></label>
        <label>Бюджет, KZT — пожелание, не фильтр<input name="budget" inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} placeholder="Необязательно" /></label>
        <label>Город / филиал<select name="branchId" required defaultValue={branches[0]?.id}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.city} — {branch.name} ({branch.timezone})</option>)}</select></label>
        <label>Начало аренды<input name="from" type="datetime-local" required /></label><label>Конец аренды<input name="until" type="datetime-local" required /></label>
        <label className="selection-wide">Название модели, если уже знаете<input name="search" maxLength={80} placeholder="Необязательно — поможет сузить выбор" /></label>
        <p className="selection-wide selection-note">Даты — по времени филиала. Если цена не указана, бюджет и стоимость комплекта сможет подтвердить только сотрудник. Обувь и аксессуары автоматически не предлагаем: их совместимость пока не описана.</p>
        <button className="primary selection-wide">{pending ? "Проверяем каталог…" : "Показать варианты по размеру и цвету"}</button>
      </fieldset></form>
      {error && <p role="alert">{error}</p>}
      {result && <section aria-label="Результаты подбора"><h3 ref={resultHeading} tabIndex={-1}>Варианты из каталога</h3><p>Размер {result.criteria.size} · {result.criteria.from.replace("T", " ")} — {result.criteria.until.replace("T", " ")}. Наличие требует подтверждения.</p><p className="selection-applied" role="status">Применённый цвет: <strong>{result.criteria.color || "любой"}</strong>{result.broadened ? " — расширен по вашему согласию; размер, филиал и даты сохранены." : ". Другие цвета автоматически не подставляются."}</p>
        {!selected && <><button type="button" disabled={pending} onClick={() => { setResult(null); setError(""); }}>Уточнить пожелания и условия</button>{!result.items.length && <div><p>По выбранному размеру{result.criteria.color ? ` и цвету «${result.criteria.color}»` : ""}{result.criteria.search ? " и названию" : ""} подтверждённых совпадений в каталоге нет. Другие цвета и размеры не подставляем.</p>{result.criteria.color && <><p>Рассмотреть другой цвет?</p><button type="button" disabled={pending} onClick={() => void find({ criteria: broadenColor(result.criteria), brief: { ...result.brief, color: `Первоначально: ${result.criteria.color}. Клиент согласился рассмотреть другие цвета.` } }, true)}>{pending ? "Проверяем…" : "Да, рассмотреть другие цвета"}</button></>}</div>}
          {result.more && <p>Есть ещё варианты. Уточните название модели, чтобы сузить выбор; здесь показаны первые пять, а не персональный рейтинг.</p>}
          <div className="selection-results">{result.items.map(item => <article className="showroom-product" key={item.id}><PhotoPlaceholder /><div className="showroom-product-info"><h3>{item.name}</h3><p>{item.execution} · Размер {item.size}</p><p>{priceText(item.price)}</p><p>{item.available ? "Доступно на выбранные даты · требует подтверждения" : "На выбранные даты недоступно · можно уточнить у сотрудника"}</p><p className="selection-note">Показано по совпадению точного размера{result.criteria.search ? " и названия" : ""}{result.criteria.color ? `; цвет «${result.criteria.color}» подтверждён полем цвета или названием исполнения` : "; цвет не ограничен"}. Повод и бюджет не проверены.</p><button disabled={pending} onClick={() => setSelected(item)}>Выбрать для заявки</button></div></article>)}</div></>}
        {selected && <InquiryForm item={selected} filters={result.criteria} branchLabel={branches.find(branch => branch.id === result.criteria.branchId)?.name ?? ""} requestText={briefForStaff(result.brief)} onNewSearch={() => setSelected(null)} />}
      </section>}
    </dialog>
  </>;
}
