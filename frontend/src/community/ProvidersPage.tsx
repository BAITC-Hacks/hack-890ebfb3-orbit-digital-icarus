import { useState } from "react";
import { communityApi } from "./api";
import { CatalogDirectory } from "./CatalogDirectory";
import { cityLabel, money, serviceLabel } from "./copy";
import { EmptyState, ErrorNotice, Loading, useCommunity, useQuery } from "./shared";
import type { Listing, Templates } from "./types";

export function ListingCard({ listing, templates, action }: { listing: Listing; templates: Templates | null; action?: React.ReactNode }) {
  const { t, locale } = useCommunity();
  return <article className="cm-listing" data-testid="community-listing">
    <div className="cm-row"><span className="cm-avatar" aria-hidden="true">{listing.provider_name.slice(0, 1).toLocaleUpperCase()}</span><div className="cm-person"><strong>{listing.provider_name}</strong><span>{cityLabel(listing.city, locale)}</span></div></div>
    <div className="cm-tags"><span className="cm-tag">{serviceLabel(listing.category, templates, locale)}</span><span className="cm-unverified">{t.unverified}</span></div>
    <h3>{listing.title}</h3><p className="cm-description">{listing.description}</p>
    <div className="cm-listing-bottom"><div className="cm-price"><span>{t.from}</span> {money(listing.price_from_kzt, locale)}</div>{action}</div>
  </article>;
}

function CommunityListings({ templates }: { templates: Templates | null }) {
  const { t, locale } = useCommunity();
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const listings = useQuery(`public:${city}:${category}`, signal => communityApi.listings({ city, category }, signal));
  const matching = (listings.data?.listings ?? []).filter(item => `${item.title} ${item.provider_name} ${item.description} ${serviceLabel(item.category, templates, locale)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const filtered = Boolean(city || category || search);
  return <>
    <form className="cm-filters" onSubmit={e => e.preventDefault()} role="search">
      <label className="cm-search">{t.search}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPlaceholder} maxLength={120} /></label>
      <label>{t.city}<select value={city} onChange={e => setCity(e.target.value)}><option value="">{t.allCities}</option>{templates?.cities.map(item => <option key={item} value={item}>{cityLabel(item, locale)}</option>)}</select></label>
      <label>{t.category}<select value={category} onChange={e => setCategory(e.target.value)}><option value="">{t.allServices}</option>{templates?.services.map(item => <option key={item.category} value={item.category}>{item.label[locale]}</option>)}</select></label>
    </form>
    <div className="cm-results-line"><span aria-live="polite">{!listings.loading && !listings.error && `${matching.length} ${t.results}`}</span>{filtered && <button className="cm-link" onClick={() => { setCity(""); setCategory(""); setSearch(""); }}>{t.clearFilters}</button>}</div>
    <ErrorNotice error={listings.error} retry={listings.reload} />
    {listings.loading ? <Loading /> : !listings.error && (matching.length ? <div className="cm-listing-grid">{matching.map(listing => <ListingCard key={listing.id} listing={listing} templates={templates} />)}</div> : <EmptyState title={t.noListings}>{t.noListingsBody}</EmptyState>)}
    {listings.data && listings.data.listings.length >= 200 && <p className="cm-footnote">{t.directoryLimit}</p>}
    <p className="cm-footnote">{t.inviteHint} <a href="#/events">{t.planEvent} ↗</a></p><div className="cm-trust-note"><span aria-hidden="true">ⓘ</span><div><p>{t.publicNote}</p><p>{t.separateCatalog}</p></div></div>
  </>;
}

export function ProvidersPage({ templates }: { templates: Templates | null }) {
  const { t, locale } = useCommunity();
  const [view, setView] = useState<"catalog" | "community">("catalog");
  return <>
    <div className="cm-hero"><div><p className="cm-eyebrow">{t.community}</p><h1>{t.providersTitle}</h1><p className="cm-lede">{t.providersIntro}</p><div className="cm-actions"><a href="#/account" className="cm-button">{t.publish} <span aria-hidden="true">↗</span></a><a href="#/events" className="cm-button cm-secondary">{t.planEvent}</a></div></div><div className="cm-hero-art" aria-hidden="true"><span className="cm-orbit cm-orbit-one" /><span className="cm-orbit cm-orbit-two" /><span className="cm-orbit cm-orbit-three" /><span className="cm-art-center">t.</span><span className="cm-art-star">✳</span></div></div>
    <div className="cm-actions cm-directory-switch" aria-label={locale === "ru" ? "Источник профилей" : "Profile source"}>
      <button className={`cm-button${view === "catalog" ? "" : " cm-secondary"}`} aria-pressed={view === "catalog"} onClick={() => setView("catalog")}>{locale === "ru" ? "Исходный каталог" : "Supplied catalog"}</button>
      <button className={`cm-button${view === "community" ? "" : " cm-secondary"}`} aria-pressed={view === "community"} onClick={() => setView("community")}>{locale === "ru" ? "Объявления сообщества" : "Community listings"}</button>
    </div>
    {view === "catalog" ? <CatalogDirectory /> : <CommunityListings templates={templates} />}
  </>;
}
