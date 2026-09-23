import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiError, getMetadata, matchContractors } from "./api/client";
import { metadata as previewMetadata, previewMatch } from "./api/demo";
import type { MatchCard, MatchRequest, MatchResponse, MetadataResponse } from "./api/types";

const previewMode = import.meta.env.VITE_API_MODE === "demo";

const initialRequest: MatchRequest = {
  city: "Алматы",
  event_date: "2026-10-11",
  event_format: "свадьба",
  category: "Ведущий",
  budget_kzt: 3_000_000,
  duration_hours: null,
  language: null,
};

const money = (value: number) => new Intl.NumberFormat("ru-RU").format(value);
const displayDate = (iso: string) => iso.split("-").reverse().join(".");
const initials = (name: string) => name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function sanitizeBudget(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function sanitizeDuration(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = normalized.split(".");
  return fraction.length ? `${whole}.${fraction.join("")}` : whole;
}

function formatBudgetForInput(value: string) {
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0
    ? money(numericValue).replaceAll("\u00a0", " ")
    : value;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="query-tag">{children}</span>;
}

function ContractorCard({ card }: { card: MatchCard }) {
  return <article className="contractor-card" data-testid="contractor-card" data-contractor-id={card.id}>
    <div className="card-person">
      <span className="avatar">{initials(card.anon_name)}</span>
      <div><h3>{card.anon_name}</h3><p>{card.category} · {card.city}</p></div>
    </div>
    <p className="price">от {money(card.price_from_kzt)} ₸</p>
    <p className="availability">Свободен {displayDate(card.event_date)}</p>
    <p className="card-explanation">{card.explanation}</p>
    <div className="notes">
      {card.synthetic && <span data-testid="synthetic-note">Синтетический профиль</span>}
      {card.price_imputed && <span data-testid="price-imputed-note">Стартовая цена восстановлена из данных</span>}
      {card.city_imputed && <span data-testid="city-imputed-note">Город восстановлен из данных</span>}
    </div>
  </article>;
}

function EmptyState({ result }: { result: MatchResponse }) {
  const absent = result.status === "category_absent";
  return <section className="empty-state" data-testid="result-summary" data-status={result.status} data-request-date={result.request.event_date}>
    <span className="empty-icon" aria-hidden="true">⌕</span>
    <h2>{absent ? "В этом городе такой категории нет" : "На эту дату свободных вариантов нет"}</h2>
    <p>{result.message}</p>
    {!absent && <p className="empty-advice">Попробуйте другую дату или скорректируйте бюджет и дополнительные условия.</p>}
  </section>;
}

export default function App() {
  const [form, setForm] = useState<MatchRequest>(initialRequest);
  const [budgetInput, setBudgetInput] = useState(String(initialRequest.budget_kzt));
  const [durationInput, setDurationInput] = useState("");
  const [metadata, setMetadata] = useState<MetadataResponse>(previewMetadata);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!previewMode) {
      getMetadata().then(setMetadata).catch(() => setError("Не удалось загрузить параметры каталога."));
    }
  }, []);

  const update = <K extends keyof MatchRequest>(key: K, value: MatchRequest[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  function requestFromForm(): MatchRequest | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.event_date) || form.event_date < metadata.calendar_start || form.event_date > metadata.calendar_end) {
      setError(`Выберите дату с ${displayDate(metadata.calendar_start)} по ${displayDate(metadata.calendar_end)}.`);
      return null;
    }

    const budgetKzt = Number(sanitizeBudget(budgetInput));
    if (!Number.isSafeInteger(budgetKzt) || budgetKzt <= 0) {
      setError("Введите бюджет целым положительным числом.");
      return null;
    }

    const duration = durationInput === "" ? null : Number(durationInput);
    if (duration !== null && (!Number.isFinite(duration) || duration < 0.5 || Math.round(duration * 2) !== duration * 2)) {
      setError("Введите длительность от 0,5 часа с шагом 0,5.");
      return null;
    }

    return { ...form, budget_kzt: budgetKzt, duration_hours: duration };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = requestFromForm();
    if (payload === null) return;

    setForm(payload);
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = previewMode ? await previewMatch(payload) : await matchContractors(payload, controller.current.signal);
      setResult(response);
    } catch (cause) {
      if ((cause as DOMException).name !== "AbortError") {
        setError(cause instanceof ApiError ? cause.message : "Не удалось отправить запрос. Проверьте подключение и попробуйте ещё раз.");
      }
    } finally {
      setLoading(false);
    }
  }

  const fields: Array<{ key: "city" | "event_format" | "category"; label: string; options: string[] }> = [
    { key: "city", label: "Город", options: metadata.cities },
    { key: "event_format", label: "Тип мероприятия", options: metadata.event_formats },
    { key: "category", label: "Категория подрядчика", options: metadata.categories },
  ];

  return <main className="page-shell">
    <header className="hero">
      <p className="eyebrow">КАТАЛОГ ПОДРЯДЧИКОВ · КАЗАХСТАН</p>
      <h1>Подбор подрядчика на<br />мероприятие</h1>
      <p className="lede">Укажите параметры мероприятия — сервис покажет до трёх доступных подрядчиков и объяснит, почему подходит каждый.</p>
    </header>
    {previewMode && <p className="preview-note">Предпросмотр интерфейса на fixtures: подключение к API отключено.</p>}
    <form className="match-form" data-testid="match-form" aria-busy={loading} noValidate onSubmit={submit}>
      <div className="field-grid">
        {fields.map(({ key, label, options }) => <label key={key}>{label}<select name={key} value={form[key]} onChange={(event) => update(key, event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>)}
        <label>Дата мероприятия<input name="event_date" type="date" min={metadata.calendar_start} max={metadata.calendar_end} value={form.event_date} onChange={(event) => update("event_date", event.target.value)} required /></label>
        <label>Бюджет, ₸
          <input name="budget_kzt" type="text" inputMode="numeric" autoComplete="off" aria-label="Бюджет, ₸" aria-describedby="budget-hint" value={budgetInput} onFocus={() => setBudgetInput(sanitizeBudget(budgetInput))} onChange={(event) => { setBudgetInput(sanitizeBudget(event.target.value)); setError(null); }} onBlur={() => setBudgetInput(formatBudgetForInput(sanitizeBudget(budgetInput)))} required />
          <small id="budget-hint" className="field-hint">Только целая сумма в тенге. Пробелы можно вводить.</small>
        </label>
        <label>Длительность, ч <em>необязательно</em>
          <input name="duration_hours" type="text" inputMode="decimal" autoComplete="off" aria-label="Длительность, ч" aria-describedby="duration-hint" placeholder="например, 6 или 6,5" value={durationInput} onChange={(event) => { setDurationInput(sanitizeDuration(event.target.value)); setError(null); }} />
          <small id="duration-hint" className="field-hint">От 0,5 часа, шаг 0,5. Буквы не принимаются.</small>
        </label>
        <label>Язык работы <em>необязательно</em><select name="language" value={form.language ?? ""} onChange={(event) => update("language", event.target.value || null)}><option value="">Не выбирать</option>{metadata.languages.map((option) => <option key={option}>{option}</option>)}</select></label>
      </div>
      <div className="form-footer"><p>Один и тот же запрос на другую дату может дать другой результат: учитывается занятость подрядчиков.</p><button type="submit" disabled={loading}>{loading ? "Ищем варианты…" : "Подобрать подрядчика"}</button></div>
    </form>
    {error && <p className="request-error" role="alert" data-testid="request-error">{error} <button onClick={() => void submit({ preventDefault() {} } as FormEvent)}>Повторить</button></p>}
    {result && <section className="results" aria-live="polite">
      <div className="result-tabs"><button onClick={() => setResult(null)}>← Новый запрос</button><span className={result.status === "matches_found" ? "active" : ""}>Подобрали</span><span className={result.status === "no_eligible_contractors" ? "active" : ""}>Ничего не подходит</span><span className={result.status === "category_absent" ? "active" : ""}>Категории нет в городе</span></div>
      <div className="query-tags"><Tag>{result.request.category}</Tag><Tag>{result.request.city}</Tag><Tag>{displayDate(result.request.event_date)}</Tag><Tag>до {money(result.request.budget_kzt)} ₸</Tag></div>
      {result.status === "matches_found" ? <div data-testid="result-summary" data-status={result.status} data-request-date={result.request.event_date} data-request-budget={result.request.budget_kzt} data-request-duration={result.request.duration_hours ?? ""}><h2>{result.cards.length === 3 ? "Нашли 3 подходящих" : `Подходит только ${result.cards.length} из ${result.counts.city_category_total}`}</h2><p className="result-message">{result.message}</p>{result.cards.length < 3 && <p className="shortfall">В категории всего {result.counts.city_category_total} профиля; показываем тех, кто проходит все выбранные условия.</p>}<div className="card-grid">{result.cards.map((item) => <ContractorCard key={item.id} card={item} />)}</div></div> : <EmptyState result={result} />}
    </section>}
  </main>;
}
