import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, ApiResponseError, getMetadata, matchContractors } from "./api/client";
import { metadata as previewMetadata, previewMatch } from "./api/demo";
import type { MatchCard, MatchRequest, MatchResponse, MetadataResponse } from "./api/types";
import {
  availabilityLabel, calendarLabel, cardExplanation, copy, displayDate, evidenceValue,
  exclusionSummary, fieldValidationMessage, formatMoney, initialLocale, invalidFields,
  LOCALE_STORAGE_KEY, optionLabel, resultSummary, resultTitle, shortfallLabel, translatedQuote,
  type Locale,
} from "./i18n";

// Example responses are available only when explicitly requested for design work.
const previewMode = import.meta.env.VITE_API_MODE === "demo";
const initialRequest: MatchRequest = {
  city: "Алматы", event_date: "2026-10-11", event_format: "свадьба", category: "Ведущий",
  budget_kzt: 3_000_000, duration_hours: null, language: null,
};
type ErrorKind = "requestError" | "serviceError" | "responseError" | "validationError";
const initials = (name: string) => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();

function storedLocale(): Locale {
  try { return initialLocale(window.localStorage); } catch { return "ru"; }
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="query-tag">{children}</span>;
}

function ContractorCard({ card, request, locale }: { card: MatchCard; request: MatchRequest; locale: Locale }) {
  const t = copy[locale];
  return <article className="contractor-card" data-testid="contractor-card" data-contractor-id={card.id}>
    <div className="card-person">
      <span className="avatar" aria-hidden="true">{initials(card.anon_name)}</span>
      <div><h3>{card.anon_name}</h3><p>{optionLabel(card.category, locale)} · {optionLabel(card.city, locale)}</p></div>
    </div>
    <p className="price">{t.priceFrom} {formatMoney(card.price_from_kzt, locale)} ₸</p>
    <p className="price-caveat">{t.priceCaveat}</p>
    <p className="availability">{availabilityLabel(card.event_date, locale)}</p>
    <p className="card-explanation">{cardExplanation(card, request, locale)}</p>
    <div className="notes">
      {card.synthetic && <span data-testid="synthetic-note">{t.synthetic}</span>}
      {card.price_imputed && <span data-testid="price-imputed-note">{t.priceImputed}</span>}
      {card.city_imputed && <span data-testid="city-imputed-note">{t.cityImputed}</span>}
    </div>
    <details className="card-evidence">
      <summary>{t.evidence}</summary>
      {card.evidence.length === 0 ? <p>{t.noEvidence}</p> : <ul>{card.evidence.map((item, index) =>
        <li key={`${item.code}-${index}`}>
          <strong>{item.code === "language" ? t.language : t[item.code]}:</strong>{" "}
          {item.source_quote ? <>
            {locale === "en" && translatedQuote(item.source_quote) && <p>{translatedQuote(item.source_quote)}</p>}
            <span className="source-quote-label">{t.originalQuote}</span>
            <blockquote lang="ru">{item.source_quote}</blockquote>
          </> : evidenceValue(item, locale)}
        </li>,
      )}</ul>}
    </details>
  </article>;
}

function OutcomeDetails({ result, locale }: { result: MatchResponse; locale: Locale }) {
  const excluded = exclusionSummary(result, locale);
  return <>
    <p className="result-message">{resultSummary(result, locale)}</p>
    {excluded && <div className="exclusion-details"><p>{excluded}</p><small>{copy[locale].firstFailure}</small></div>}
  </>;
}

function EmptyState({ result, locale }: { result: MatchResponse; locale: Locale }) {
  return <section className="empty-state" data-testid="result-summary" data-status={result.status} data-request-date={result.request.event_date}>
    <span className="empty-icon" aria-hidden="true">⌕</span>
    <h2>{resultTitle(result, locale)}</h2>
    <OutcomeDetails result={result} locale={locale} />
    {result.status !== "category_absent" && <p className="empty-advice">{copy[locale].emptyAdvice}</p>}
  </section>;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const [form, setForm] = useState<MatchRequest>(initialRequest);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(previewMode ? previewMetadata : null);
  const [metadataLoading, setMetadataLoading] = useState(!previewMode);
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const metadataController = useRef<AbortController | null>(null);
  const searchGeneration = useRef(0);
  const metadataGeneration = useRef(0);
  const formElement = useRef<HTMLFormElement>(null);
  const t = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Locale still works for this page. */ }
  }, [locale]);

  async function loadCatalog() {
    const generation = ++metadataGeneration.current;
    metadataController.current?.abort();
    const active = new AbortController();
    metadataController.current = active;
    setMetadataLoading(true);
    setMetadataFailed(false);
    try {
      const received = previewMode ? previewMetadata : await getMetadata({ signal: active.signal });
      if (generation === metadataGeneration.current) setMetadata(received);
    } catch (cause) {
      if (generation === metadataGeneration.current && !(cause instanceof Error && cause.name === "AbortError")) {
        setMetadata(null);
        setMetadataFailed(true);
      }
    } finally {
      if (generation === metadataGeneration.current) setMetadataLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
    return () => {
      ++metadataGeneration.current;
      ++searchGeneration.current;
      metadataController.current?.abort();
      controller.current?.abort();
    };
  }, []);

  function clearSearch() {
    ++searchGeneration.current;
    controller.current?.abort();
    setLoading(false);
    setResult(null);
    setError(null);
    setInvalid([]);
  }

  function update<K extends keyof MatchRequest>(key: K, value: MatchRequest[K]) {
    clearSearch();
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!metadata || metadataLoading || loading) return;
    const invalidInputs = invalidFields(form, metadata);
    setInvalid(invalidInputs);
    if (invalidInputs.length) {
      setError("validationError");
      (formElement.current?.elements.namedItem(invalidInputs[0]) as HTMLElement | null)?.focus();
      return;
    }
    const generation = ++searchGeneration.current;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError(null);
    setResult(null);
    const request = { ...form };
    try {
      const response = previewMode ? await previewMatch(request) : await matchContractors(request, { signal: active.signal });
      if (generation === searchGeneration.current) setResult(response);
    } catch (cause) {
      if (generation !== searchGeneration.current || (cause instanceof Error && cause.name === "AbortError")) return;
      if (cause instanceof ApiError && cause.status === 422) {
        setInvalid([...new Set(Object.keys(cause.fieldErrors).map(field => field.split(".")[0]))]);
        setError("validationError");
      } else if (cause instanceof ApiResponseError) setError("responseError");
      else setError(cause instanceof ApiError ? "serviceError" : "requestError");
    } finally {
      if (generation === searchGeneration.current) setLoading(false);
    }
  }

  const fieldError = (key: keyof MatchRequest) => invalid.includes(key)
    ? <span className="field-error" id={`error-${key}`}>{fieldValidationMessage(key, metadata, locale)}</span> : null;
  const fieldAttributes = (key: keyof MatchRequest) => ({
    "aria-invalid": invalid.includes(key),
    "aria-describedby": invalid.includes(key) ? `error-${key}` : undefined,
  });
  const fields: Array<{ key: "city" | "event_format" | "category"; options: string[] }> = [
    { key: "city", options: metadata?.cities ?? [] },
    { key: "event_format", options: metadata?.event_formats ?? [] },
    { key: "category", options: metadata?.categories ?? [] },
  ];
  const unavailable = !metadata || metadataLoading;

  return <main className="page-shell">
    <div className="locale-switcher" data-testid="locale-switcher" role="group" aria-label={t.interfaceLanguage}>
      <span>{t.interfaceLanguage}</span>
      <button type="button" lang="ru" aria-pressed={locale === "ru"} onClick={() => setLocale("ru")}>Русский</button>
      <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>English</button>
    </div>
    <header className="hero"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}<br />{t.titleSecond}</h1><p className="lede">{t.lede}</p></header>
    {previewMode && <p className="preview-note" role="note">{t.preview}</p>}
    {metadataLoading && <p className="catalog-status" role="status">{t.metadataLoading}</p>}
    {metadataFailed && <div className="request-error" role="alert" data-testid="metadata-error">{t.metadataError} <button type="button" onClick={() => void loadCatalog()}>{t.retry}</button></div>}
    <form ref={formElement} className="match-form" data-testid="match-form" aria-busy={loading} onSubmit={submit} noValidate>
      <div className="field-grid">
        {fields.map(({ key, options }) => <label key={key}>{t[key]}<select name={key} value={form[key]} disabled={unavailable} {...fieldAttributes(key)} onChange={event => update(key, event.target.value)} required>
          {options.map(option => <option key={option} value={option}>{optionLabel(option, locale)}</option>)}
        </select>{fieldError(key)}</label>)}
        <label>{t.event_date}<input name="event_date" type="date" min={metadata?.calendar_start} max={metadata?.calendar_end} value={form.event_date} disabled={unavailable} {...fieldAttributes("event_date")} onChange={event => update("event_date", event.target.value)} required />{fieldError("event_date")}</label>
        <label>{t.budget_kzt}<input name="budget_kzt" type="number" min="1" step="1" value={form.budget_kzt || ""} disabled={unavailable} {...fieldAttributes("budget_kzt")} onChange={event => update("budget_kzt", Number(event.target.value))} required />{fieldError("budget_kzt")}</label>
        <label>{t.duration_hours} <em>{t.optional}</em><input name="duration_hours" type="number" min="0.01" step="any" placeholder={t.durationPlaceholder} value={form.duration_hours ?? ""} disabled={unavailable} {...fieldAttributes("duration_hours")} onChange={event => update("duration_hours", event.target.value ? Number(event.target.value) : null)} />{fieldError("duration_hours")}</label>
        <label>{t.language} <em>{t.optional}</em><select name="language" value={form.language ?? ""} disabled={unavailable} {...fieldAttributes("language")} onChange={event => update("language", event.target.value || null)}>
          <option value="">{t.noLanguage}</option>{metadata?.languages.map(option => <option key={option} value={option}>{optionLabel(option, locale)}</option>)}
        </select><small className="field-hint">{t.languageHint}</small>{fieldError("language")}</label>
      </div>
      {metadata && <p className="calendar-note">{calendarLabel(metadata, locale)}</p>}
      <div className="form-footer"><p>{t.footer}</p><button type="submit" disabled={loading || unavailable}>{loading ? t.loading : t.submit}</button></div>
    </form>
    {error && <div className="request-error" role="alert" data-testid="request-error">{t[error]} <button type="button" disabled={loading || unavailable} onClick={() => formElement.current?.requestSubmit()}>{t.retry}</button></div>}
    {result && <section className="results" aria-live="polite">
      <div className="result-tabs"><button type="button" onClick={clearSearch}>{t.newRequest}</button><span className={result.status === "matches_found" ? "active" : ""}>{t.foundTab}</span><span className={result.status === "no_eligible_contractors" ? "active" : ""}>{t.emptyTab}</span><span className={result.status === "category_absent" ? "active" : ""}>{t.absentTab}</span></div>
      <div className="query-tags"><Tag>{optionLabel(result.request.category, locale)}</Tag><Tag>{optionLabel(result.request.city, locale)}</Tag><Tag>{displayDate(result.request.event_date)}</Tag><Tag>{locale === "ru" ? "до" : "up to"} {formatMoney(result.request.budget_kzt, locale)} ₸</Tag></div>
      {result.status === "matches_found" ? <div data-testid="result-summary" data-status={result.status} data-request-date={result.request.event_date}>
        <h2>{resultTitle(result, locale)}</h2><OutcomeDetails result={result} locale={locale} />
        {result.cards.length < 3 && <p className="shortfall">{shortfallLabel(result, locale)}</p>}
        <div className="card-grid">{result.cards.map(item => <ContractorCard key={item.id} card={item} request={result.request} locale={locale} />)}</div>
      </div> : <EmptyState result={result} locale={locale} />}
    </section>}
  </main>;
}
