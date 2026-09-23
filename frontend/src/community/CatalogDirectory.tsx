import { useState } from "react";
import { copy as sourceCopy, displayDate, formatMoney, optionLabel } from "../i18n";
import { Loading, useCommunity, useQuery } from "./shared";

type Profile = {
  id: string; anon_name: string; categories: string[]; city: string; price_from_kzt: number;
  description: string; event_formats: string[]; languages: string[];
  synthetic: boolean; city_imputed: boolean; price_imputed: boolean; source_kind: string;
};
type Catalog = { dataset_version: string; calendar_start: string; calendar_end: string; profiles: Profile[] };
const words = {
  en: {
    title: "Supplied catalog", notice: "Browse the supplied profiles, not registered accounts. This directory does not check your date or budget. Source profiles cannot accept invitations or join chats.",
    search: "Search by name, service or profile ID", city: "City", category: "Service", allCities: "All cities", allServices: "All services",
    profile: "Supplied profile · no linked account", check: "Check event requirements", more: "Show more profiles", empty: "No source profiles match these filters.",
    description: "Original Russian description", failed: "Could not load the source catalog. Restart an older backend or check the connection, then retry.",
    snapshot: "Calendar snapshot", disclaimer: "Browse cards do not confirm availability, contact details or a booking.",
    count: (shown: number, matched: number, total: number) => `Showing ${shown} of ${matched} profiles · ${total} in the supplied catalog`,
  },
  ru: {
    title: "Исходный каталог", notice: "Это предоставленные профили, а не зарегистрированные аккаунты. Просмотр каталога не проверяет вашу дату и бюджет. Эти профили нельзя приглашать в команды и чаты.",
    search: "Поиск по имени, услуге или ID профиля", city: "Город", category: "Услуга", allCities: "Все города", allServices: "Все услуги",
    profile: "Исходный профиль · без аккаунта", check: "Проверить условия события", more: "Показать ещё профили", empty: "В исходном каталоге нет профилей по этим фильтрам.",
    description: "Исходное описание", failed: "Не удалось загрузить исходный каталог. Перезапустите устаревший сервер или проверьте подключение и повторите попытку.",
    snapshot: "Снимок календаря", disclaimer: "Карточки каталога не подтверждают доступность, контакты или бронирование.",
    count: (shown: number, matched: number, total: number) => `Показано ${shown} из ${matched} профилей · всего в исходном каталоге ${total}`,
  },
};

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
async function loadCatalog(signal: AbortSignal): Promise<Catalog> {
  const response = await fetch("/api/catalog", { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("catalog_unavailable");
  const data = await response.json();
  if (!data || typeof data.dataset_version !== "string" || typeof data.calendar_start !== "string" || typeof data.calendar_end !== "string"
    || !Array.isArray(data.profiles) || !data.profiles.every((p: Profile) => p && typeof p.id === "string" && typeof p.anon_name === "string"
      && typeof p.city === "string" && typeof p.description === "string" && typeof p.source_kind === "string"
      && Number.isSafeInteger(p.price_from_kzt) && p.price_from_kzt > 0 && strings(p.categories) && strings(p.languages) && strings(p.event_formats)
      && [p.synthetic, p.city_imputed, p.price_imputed].every(flag => typeof flag === "boolean"))) throw new Error("invalid_catalog");
  return data;
}

/** Read-only browsing never turns a source record into an account or an eligible match. */
export function CatalogDirectory() {
  const { locale, t: shared } = useCommunity();
  const t = words[locale];
  const source = sourceCopy[locale];
  const query = useQuery("source-catalog", loadCatalog);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(12);
  if (query.loading) return <Loading />;
  if (query.error || !query.data) return <div className="cm-notice cm-error" role="alert">{t.failed} <button className="cm-link" onClick={query.reload}>{shared.retry}</button></div>;
  const catalog = query.data;
  const needle = search.trim().toLocaleLowerCase();
  const matching = catalog.profiles.filter(profile => (!city || profile.city === city) && (!category || profile.categories.includes(category))
    && `${profile.id} ${profile.anon_name} ${profile.description} ${profile.categories.map(value => `${value} ${optionLabel(value, locale)}`).join(" ")}`.toLocaleLowerCase().includes(needle));
  const visible = matching.slice(0, limit);
  const cities = [...new Set(catalog.profiles.map(profile => profile.city))].sort();
  const categories = [...new Set(catalog.profiles.flatMap(profile => profile.categories))].sort();
  return <section aria-label={t.title} data-testid="catalog-directory">
    <div className="cm-trust-note"><div><p>{t.notice}</p><p>{t.snapshot}: {displayDate(catalog.calendar_start)}–{displayDate(catalog.calendar_end)}. {t.disclaimer}</p></div></div>
    <form className="cm-filters" role="search" onSubmit={event => event.preventDefault()}>
      <label className="cm-search">{t.search}<input type="search" maxLength={120} value={search} onChange={event => { setSearch(event.target.value); setLimit(12); }} /></label>
      <label>{t.city}<select value={city} onChange={event => { setCity(event.target.value); setLimit(12); }}><option value="">{t.allCities}</option>{cities.map(value => <option key={value} value={value}>{optionLabel(value, locale)}</option>)}</select></label>
      <label>{t.category}<select value={category} onChange={event => { setCategory(event.target.value); setLimit(12); }}><option value="">{t.allServices}</option>{categories.map(value => <option key={value} value={value}>{optionLabel(value, locale)}</option>)}</select></label>
    </form>
    <p className="cm-results-line" role="status">{t.count(visible.length, matching.length, catalog.profiles.length)}</p>
    {!matching.length && <p className="cm-empty">{t.empty}</p>}
    <div className="cm-listing-grid">{visible.map(profile => <article className="cm-listing" data-testid="catalog-profile" data-profile-id={profile.id} key={profile.id}>
      <div className="cm-row"><span className="cm-avatar" aria-hidden="true">{profile.anon_name.slice(0, 1)}</span><div className="cm-person"><strong>{profile.anon_name}</strong><span>{optionLabel(profile.city, locale)} · {profile.id}</span></div></div>
      <div className="cm-tags">{profile.categories.map(value => <span className="cm-tag" key={value}>{optionLabel(value, locale)}</span>)}</div>
      <p className="cm-unverified">{t.profile}</p>
      {profile.synthetic && <p className="cm-footnote">{source.synthetic}</p>}
      {profile.city_imputed && <p className="cm-footnote">{source.cityImputed}</p>}
      {profile.price_imputed && <p className="cm-footnote">{source.priceImputed}</p>}
      <details className="cm-catalog-description"><summary>{t.description}</summary><p lang="ru">{profile.description}</p></details>
      <div className="cm-listing-bottom"><div className="cm-price"><span>{source.priceFrom}</span> {formatMoney(profile.price_from_kzt, locale)} ₸</div></div>
      <a className="cm-button cm-secondary" href="#/match">{t.check} ↗</a>
    </article>)}</div>
    {visible.length < matching.length && <div className="cm-actions"><button className="cm-button cm-secondary" onClick={() => setLimit(value => value + 12)}>{t.more}</button></div>}
  </section>;
}
