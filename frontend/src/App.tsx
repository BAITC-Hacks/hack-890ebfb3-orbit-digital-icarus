import { type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, ApiResponseError, getMetadata, matchContractors } from "./api/client";
import { metadata as previewMetadata, previewMatch } from "./api/demo";
import type { MatchAlternative, MatchCard, MatchRequest, MatchResponse, MetadataResponse } from "./api/types";
import { acceptBudgetDraft, acceptDurationDraft, parseBudgetDraft, parseDurationDraft, MAX_DURATION_HOURS } from "./formNumbers";
import { HomePage } from "./components/HomePage";
import { ContactPanel } from "./components/ContactPanel";
import { TandauLogo } from "./components/TandauLogo";
import { journeyCopy } from "./journeyCopy";
import { usePage } from "./usePage";
import {
  availabilityLabel, cardExplanation, copy, displayDate, evidenceValue,
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
type NumericField = "budget_kzt" | "duration_hours";
type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "contractor-match-theme";
const initials = (name: string) => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();

function storedLocale(): Locale {
  // Private browsing or disabled storage must not prevent the app from opening.
  try { return initialLocale(window.localStorage); } catch { return "ru"; }
}

function storedTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch { return "dark"; }
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="query-tag">{children}</span>;
}

function ContractorCard({ card, request, locale }: { card: MatchCard; request: MatchRequest; locale: Locale }) {
  // Presentation never changes server eligibility or order; quotes retain their original language.
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
    <ContactPanel card={card} request={request} locale={locale} />
  </article>;
}

function OutcomeDetails({ result, locale }: { result: MatchResponse; locale: Locale }) {
  const excluded = exclusionSummary(result, locale);
  return <>
    <p className="result-message">{resultSummary(result, locale)}</p>
    {excluded && <div className="exclusion-details"><p>{excluded}</p><small>{copy[locale].firstFailure}</small></div>}
  </>;
}

function EmptyState({ result, locale, onAlternative }: { result: MatchResponse; locale: Locale; onAlternative: (alternative: MatchAlternative) => void }) {
  // Suggestions are already verified by the API and only execute through an explicit click.
  return <section className="empty-state" data-testid="result-summary" data-status={result.status} data-request-date={result.request.event_date}>
    <span className="empty-icon" aria-hidden="true">⌕</span>
    <h2>{resultTitle(result, locale)}</h2>
    <OutcomeDetails result={result} locale={locale} />
    <p className="empty-advice">{copy[locale].emptyAdvice}</p>
    {Boolean(result.alternatives?.length) && <div className="match-alternatives" data-testid="match-alternatives">
      <h3>{locale === "ru" ? "Можно изменить одно условие" : "Try changing one condition"}</h3>
      <p>{locale === "ru" ? "Эти варианты проверены по каталогу. Остальные условия сохраняются. Изменение применится только после нажатия." : "These alternatives were checked against the catalog. Every other condition stays the same. A change applies only when you choose it."}</p>
      {result.alternatives!.map((alternative, index) => {
        const value = alternative.changed_field === "city" ? optionLabel(alternative.request.city, locale)
          : alternative.changed_field === "event_date" ? displayDate(alternative.request.event_date)
          : `${formatMoney(alternative.request.budget_kzt, locale)} ₸`;
        return <button key={index} type="button" data-testid="match-alternative" data-changed-field={alternative.changed_field} onClick={() => onAlternative(alternative)}>
          <strong>{copy[locale][alternative.changed_field]}: {value}</strong>
          <span>{locale === "ru" ? `Подходящих профилей: ${alternative.eligible_total} · Найти с этим условием` : `${alternative.eligible_total} eligible profiles · Search with this change`}</span>
        </button>;
      })}
    </div>}
  </section>;
}

export default function App() {
  const page = usePage(); // Navigation does not discard the customer's form or previous result.
  const [locale, setLocale] = useState<Locale>(storedLocale);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [form, setForm] = useState<MatchRequest>(initialRequest);
  const [numericDrafts, setNumericDrafts] = useState({ budget_kzt: String(initialRequest.budget_kzt), duration_hours: "" });
  const rejectedEdits = useRef(new Set<NumericField>());
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
  const journey = journeyCopy[locale];

  useEffect(() => {
    document.title = `Tandau · ${journey[page === "home" ? "home" : "match"]}`;
  }, [locale, page]); // Direct links and locale switches keep the browser title useful.

  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Locale still works for this page. */ }
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101815" : "#faf8f2");
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* The visual preference still works for this page. */ }
  }, [theme]);

  async function loadCatalog() {
    // A generation guard also covers fetch implementations that ignore cancellation.
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
    // Editing any condition invalidates cards and outstanding responses before the next search.
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

  function rejectNumericEdit(key: NumericField) {
    // Remember the rejection separately from the retained visible draft; never submit a misleading prefix.
    clearSearch();
    rejectedEdits.current.add(key);
    setInvalid([...rejectedEdits.current]);
    setError("validationError");
  }

  function acceptsNumeric(key: NumericField, value: string) {
    return key === "budget_kzt" ? acceptBudgetDraft(value) : acceptDurationDraft(value);
  }

  function editNumeric(key: NumericField, value: string) {
    if (!acceptsNumeric(key, value)) { rejectNumericEdit(key); return; }
    // A rejected 'e' must not turn subsequent typing of '4e2' into 42.
    // An empty draft has no numeric prefix to corrupt: the next valid input starts fresh.
    // Nonempty rejected drafts still require deletion/replacement to avoid '4e2' becoming 42.
    if (rejectedEdits.current.has(key) && numericDrafts[key] !== "" && value !== "" && value.length >= numericDrafts[key].length) {
      rejectNumericEdit(key);
      return;
    }
    rejectedEdits.current.delete(key);
    clearSearch();
    setNumericDrafts(current => ({ ...current, [key]: value }));
    // Keep an over-limit draft editable, but flag it immediately; never silently clamp its meaning.
    if (key === "duration_hours" && Number(value.replace(",", ".")) > MAX_DURATION_HOURS) {
      setInvalid([key]);
      setError("validationError");
    }
  }

  function numericKeyDown(key: NumericField, event: KeyboardEvent<HTMLInputElement>) {
    // Leave navigation/selection shortcuts intact while blocking signs and exponent letters.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Backspace" || event.key === "Delete") rejectedEdits.current.delete(key);
    if (event.key.length !== 1) return;
    const replacing = event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;
    if (!acceptsNumeric(key, event.key) || (rejectedEdits.current.has(key) && numericDrafts[key] !== "" && !replacing)) {
      event.preventDefault();
      rejectNumericEdit(key);
    } else if (replacing) rejectedEdits.current.delete(key);
  }

  function numericPaste(key: NumericField, event: ClipboardEvent<HTMLInputElement>) {
    // Validate the proposed full value, including any text outside the selected range.
    const input = event.currentTarget;
    const pasted = event.clipboardData.getData("text");
    const proposed = input.value.slice(0, input.selectionStart ?? 0) + pasted + input.value.slice(input.selectionEnd ?? input.value.length);
    if (!acceptsNumeric(key, proposed) || (key === "budget_kzt" && /[ \u00a0\u202f]/.test(proposed) && parseBudgetDraft(proposed) === undefined)) {
      event.preventDefault();
      rejectNumericEdit(key);
    } else rejectedEdits.current.delete(key);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    // Parse only at submission: unfinished decimals are invalid, intentionally blank duration is null.
    event.preventDefault();
    if (!metadata || metadataLoading || loading) return;
    const budget = parseBudgetDraft(numericDrafts.budget_kzt);
    const duration = parseDurationDraft(numericDrafts.duration_hours);
    const request: MatchRequest = { ...form, budget_kzt: budget ?? NaN, duration_hours: duration === undefined ? NaN : duration };
    const invalidInputs = [...new Set([...invalidFields(request, metadata), ...rejectedEdits.current])];
    setInvalid(invalidInputs);
    if (invalidInputs.length) {
      setError("validationError");
      (formElement.current?.elements.namedItem(invalidInputs[0]) as HTMLElement | null)?.focus();
      return;
    }
    await search(request);
  }

  async function search(request: MatchRequest) {
    // Errors never fall back to demo data or masquerade as an honest empty business outcome.
    const generation = ++searchGeneration.current;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError(null);
    setResult(null);
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

  function chooseAlternative(alternative: MatchAlternative) {
    const request = alternative.request;
    clearSearch();
    rejectedEdits.current.clear();
    setForm(request);
    setNumericDrafts({ budget_kzt: String(request.budget_kzt), duration_hours: request.duration_hours == null ? "" : String(request.duration_hours) });
    void search(request);
  }

  function chooseCategory(category: string) {
    update("category", category); // Preserve other draft conditions; require an explicit search.
    window.location.hash = "/match";
  }

  const fieldError = (key: keyof MatchRequest) => invalid.includes(key)
    ? <span className="field-error" id={`error-${key}`}>{fieldValidationMessage(key, metadata, locale)}</span> : null;
  const fieldAttributes = (key: keyof MatchRequest) => ({
    "aria-invalid": invalid.includes(key),
    "aria-describedby": [invalid.includes(key) ? `error-${key}` : "", key === "budget_kzt" || key === "duration_hours" ? `hint-${key}` : ""].filter(Boolean).join(" ") || undefined,
  });
  const selectField = (key: "city" | "event_format" | "category", options: string[]) => <label>{t[key]}<select name={key} value={form[key]} disabled={unavailable} {...fieldAttributes(key)} onChange={event => update(key, event.target.value)} required>
    {options.map(option => <option key={option} value={option}>{optionLabel(option, locale)}</option>)}
  </select>{fieldError(key)}</label>;
  const languageOptions = [...(metadata?.languages ?? [])].sort((left, right) => ["русский", "казахский", "английский"].indexOf(left) - ["русский", "казахский", "английский"].indexOf(right));
  const unavailable = !metadata || metadataLoading;

  return <div className="page-shell">
    {/* The skip link moves focus without changing the hash route. */}
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById("content")?.focus(); }}>{journey.skip}</a>
    <header className="site-header">
      <a className="brand" href="#/" aria-label="Tandau"><TandauLogo /></a>
      <nav className="site-nav" aria-label={locale === "ru" ? "Основная навигация" : "Main navigation"}>
        <a href="#/" aria-current={page === "home" ? "page" : undefined}>{journey.home}</a>
        <a href="#/match" aria-current={page === "match" ? "page" : undefined}>{journey.match}</a>
      </nav>
    <div className="top-controls">
      <div className="locale-switcher" data-testid="locale-switcher" role="group" aria-label={t.interfaceLanguage}>
        <span>{t.interfaceLanguage}</span>
        <button type="button" lang="ru" aria-pressed={locale === "ru"} onClick={() => setLocale("ru")}>Русский</button>
        <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>English</button>
      </div>
      <button className="theme-toggle" data-theme={theme} type="button" aria-pressed={theme === "dark"}
        aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"} onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}>
        <span aria-hidden="true">☼</span><span aria-hidden="true">☾</span>
      </button>
    </div>
    </header>
    <main id="content" tabIndex={-1}>
    {previewMode && <p className="preview-note" role="note">{t.preview}</p>}
    {metadataLoading && <p className="catalog-status" role="status">{t.metadataLoading}</p>}
    {metadataFailed && <div className="request-error" role="alert" data-testid="metadata-error">{t.metadataError} <button type="button" onClick={() => void loadCatalog()}>{t.retry}</button></div>}
    {page === "home" ? <HomePage locale={locale} metadata={metadata} onCategory={chooseCategory} /> : <>
    <header className="hero"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}{" "}<br />{t.titleSecond}</h1><p className="lede">{t.lede}</p></header>
    <form ref={formElement} className="match-form" data-testid="match-form" aria-busy={loading} onSubmit={submit} noValidate>
      <div className="field-grid">
        {selectField("city", metadata?.cities ?? [])}
        <label>{t.event_date}<input name="event_date" type="date" min={metadata?.calendar_start} max={metadata?.calendar_end} value={form.event_date} disabled={unavailable} {...fieldAttributes("event_date")} onChange={event => update("event_date", event.target.value)} required />{fieldError("event_date")}</label>
        {selectField("event_format", metadata?.event_formats ?? [])}
        {selectField("category", metadata?.categories ?? [])}
      </div>
      <div className="form-details">
        <div className="field-grid">
        <label>{t.budget_kzt}<input name="budget_kzt" aria-label={t.budget_kzt} type="text" inputMode="numeric" autoComplete="off" value={numericDrafts.budget_kzt} disabled={unavailable} {...fieldAttributes("budget_kzt")} onKeyDown={event => numericKeyDown("budget_kzt", event)} onPaste={event => numericPaste("budget_kzt", event)} onChange={event => editNumeric("budget_kzt", event.target.value)} required /><small className="field-hint" id="hint-budget_kzt">{journey.budgetHint}</small>{fieldError("budget_kzt")}</label>
        <label>{t.duration_hours} <em>{t.optional}</em><input name="duration_hours" aria-label={t.duration_hours} type="text" inputMode="decimal" autoComplete="off" placeholder={t.durationPlaceholder} value={numericDrafts.duration_hours} disabled={unavailable} {...fieldAttributes("duration_hours")} onKeyDown={event => numericKeyDown("duration_hours", event)} onPaste={event => numericPaste("duration_hours", event)} onChange={event => editNumeric("duration_hours", event.target.value)} /><small className="field-hint" id="hint-duration_hours">{journey.durationHint}</small>{fieldError("duration_hours")}</label>
        <fieldset className="language-field"><legend>{t.language} <em>{t.optional}</em></legend><div className="language-options">
          {languageOptions.map(option => <label className="language-option" key={option}><input type="checkbox" checked={form.language === option} disabled={unavailable} onChange={event => update("language", event.target.checked ? option : null)} /><span>{optionLabel(option, locale)}</span></label>)}
        </div>{fieldError("language")}</fieldset>
        </div>
      </div>
      <div className="form-footer"><p>{t.footer}</p><button type="submit" disabled={loading || unavailable}>{loading ? t.loading : t.submit}</button></div>
    </form>
    {error && <div className="request-error" role="alert" data-testid="request-error">{t[error]} <button type="button" disabled={loading || unavailable} onClick={() => formElement.current?.requestSubmit()}>{t.retry}</button></div>}
    {result && <section className="results" aria-live="polite">
      <div className="result-tabs"><button type="button" onClick={clearSearch}>{t.newRequest}</button><span className={result.status === "matches_found" ? "active" : ""}>{t.foundTab}</span><span className={result.status === "no_eligible_contractors" ? "active" : ""}>{t.emptyTab}</span><span className={result.status === "category_absent" ? "active" : ""}>{t.absentTab}</span></div>
      <div className="query-tags"><Tag>{optionLabel(result.request.category, locale)}</Tag><Tag>{optionLabel(result.request.city, locale)}</Tag><Tag>{optionLabel(result.request.event_format, locale)}</Tag><Tag>{displayDate(result.request.event_date)}</Tag><Tag>{locale === "ru" ? "до" : "up to"} {formatMoney(result.request.budget_kzt, locale)} ₸</Tag>{result.request.duration_hours != null && <Tag>{result.request.duration_hours} {locale === "ru" ? "ч" : "hours"}</Tag>}{result.request.language && <Tag>{optionLabel(result.request.language, locale)}</Tag>}</div>
      {result.status === "matches_found" ? <div data-testid="result-summary" data-status={result.status} data-request-date={result.request.event_date}>
        <h2>{resultTitle(result, locale)}</h2><OutcomeDetails result={result} locale={locale} />
        {result.cards.length < 3 && <p className="shortfall">{shortfallLabel(result, locale)}</p>}
        <div className="card-grid">{result.cards.map(item => <ContractorCard key={item.id} card={item} request={result.request} locale={locale} />)}</div>
      </div> : <EmptyState result={result} locale={locale} onAlternative={chooseAlternative} />}
    </section>}
    </>}
    </main>
    <footer className="site-footer">
      <div className="footer-main"><a className="brand" href="#/" aria-label="Tandau"><TandauLogo /></a><p>{journey.footer}</p><nav aria-label={journey.footerNav}><a href="#/">{journey.home}</a><a href="#/match">{journey.match}</a><a href="#/how-it-works">{journey.learn}</a></nav></div>
      <p className="footer-note">{journey.footerNote}</p>
    </footer>
  </div>;
}
