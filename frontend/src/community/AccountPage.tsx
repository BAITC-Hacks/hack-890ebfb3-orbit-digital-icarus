import { useRef, useState } from "react";
import { acceptBudgetDraft, parseBudgetDraft } from "../formNumbers";
import { communityApi } from "./api";
import { cityLabel } from "./copy";
import { ListingCard } from "./ProvidersPage";
import { EmptyState, ErrorNotice, Loading, SectionHeading, useCommunity, useMutation, useQuery } from "./shared";
import type { Listing, ListingInput, Templates, User } from "./types";

export function AccountPage({ templates, onSignedIn }: { templates: Templates | null; onSignedIn: (user: User) => void }) {
  const { t, user } = useCommunity();
  return <>
    <header className="cm-page-header"><p className="cm-eyebrow">{t.community}</p><h1>{t.accountTitle}</h1><p className="cm-lede">{t.accountIntro}</p></header>
    {user ? <><div className="cm-account-card"><span className="cm-avatar cm-avatar-large" aria-hidden="true">{user.display_name.slice(0, 1)}</span><div><p className="cm-eyebrow">{t.welcome}</p><h2>{user.display_name}</h2><p className="cm-muted">@{user.username} · {t[user.role]}</p></div><a className="cm-button cm-secondary" href="#/events">{t.events} ↗</a></div>{user.role === "provider" ? <ProviderDashboard templates={templates} /> : <div className="cm-organizer-start"><SectionHeading title={t.events}>{t.eventsIntro}</SectionHeading><a className="cm-button" href="#/events">{t.planEvent} ↗</a></div>}</> : <AuthForm onSignedIn={onSignedIn} />}
  </>;
}

function AuthForm({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const { t } = useCommunity();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [role, setRole] = useState<User["role"]>("organizer");
  const mutation = useMutation(false);
  return <div className="cm-auth-layout"><div className="cm-panel cm-auth-panel">
    <div className="cm-segments" aria-label={t.account}>{(["register", "login"] as const).map(item => <button type="button" disabled={mutation.busy} key={item} aria-pressed={mode === item} onClick={() => { setMode(item); mutation.clearError(); }}>{item === "register" ? t.signUp : t.signIn}</button>)}</div>
    <form key={mode} data-testid="auth-form" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const credentials = { username: String(data.get("username")).trim(), password: String(data.get("password")) };
      void mutation.run(signal => mode === "register" ? communityApi.register({ ...credentials, display_name: String(data.get("display_name")).trim(), role }, signal) : communityApi.login(credentials, signal), result => onSignedIn(result.user));
    }}>
      <fieldset disabled={mutation.busy} className="cm-fields">
        {mode === "register" && <fieldset className="cm-role-field"><legend>{t.chooseRole}</legend><div className="cm-role-options">{(["organizer", "provider"] as const).map(item => <label className="cm-role" key={item}><input type="radio" name="role" value={item} checked={role === item} onChange={() => setRole(item)} /><span><strong>{t[item]}</strong><small>{item === "organizer" ? t.organizerHint : t.providerHint}</small></span></label>)}</div></fieldset>}
        {mode === "register" && <label>{t.displayName}<input name="display_name" autoComplete="name" required maxLength={120} pattern=".*\S.*" /></label>}
        <label>{t.username}<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_.\-]+" aria-describedby="cm-username-hint" /><small id="cm-username-hint">{t.usernameHint}</small></label>
        <label>{t.password}<input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={10} maxLength={128} aria-describedby="cm-password-hint" /><small id="cm-password-hint">{t.passwordHint}</small></label>
        <button className="cm-button cm-full" type="submit">{mutation.busy ? t.saving : mode === "register" ? t.signUp : t.signIn}</button>
      </fieldset><ErrorNotice error={mutation.error} />
    </form>
  </div><aside className="cm-auth-aside"><span className="cm-empty-mark" aria-hidden="true">✳</span><h2>{t.noEmail}</h2><p>{t.gateBody}</p><a href="#/providers" className="cm-link">{t.providers} ↗</a></aside></div>;
}

function ProviderDashboard({ templates }: { templates: Templates | null }) {
  const { t, user } = useCommunity();
  const listings = useQuery(`mine:${user?.id}`, signal => communityApi.listings({ mine: true }, signal));
  const [editing, setEditing] = useState<Listing | "new" | null>(null);
  const [saved, setSaved] = useState(false);
  return <section className="cm-section">
    <SectionHeading title={t.dashboard} action={<button className="cm-button" disabled={!templates || editing !== null} onClick={() => { setEditing("new"); setSaved(false); }}>{t.newListing} +</button>}>{t.dashboardIntro}</SectionHeading>
    {saved && <p className="cm-notice cm-success" role="status">{t.listingSaved}</p>}
    {editing && templates && <ListingForm key={editing === "new" ? "new" : editing.id} listing={editing === "new" ? null : editing} templates={templates} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setSaved(true); listings.reload(); }} />}
    <ErrorNotice error={listings.error} retry={listings.reload} />
    {listings.loading ? <Loading /> : !listings.error && (listings.data?.listings.length ? <div className="cm-listing-grid">{listings.data.listings.map(listing => <ListingCard key={listing.id} listing={listing} templates={templates} action={<div className="cm-row cm-spread"><span className={`cm-badge ${listing.active ? "cm-badge-green" : ""}`}>{listing.active ? t.visible : t.hidden}</span><button className="cm-link" disabled={editing !== null || !templates} onClick={() => { setEditing(listing); setSaved(false); }}>{t.edit}</button></div>} />)}</div> : !editing && <EmptyState title={t.noOwnListings}>{t.noOwnListingsBody}</EmptyState>)}
    <p className="cm-footnote">{t.separateCatalog}</p>
  </section>;
}

function ListingForm({ listing, templates, onCancel, onSaved }: { listing: Listing | null; templates: Templates; onCancel: () => void; onSaved: () => void }) {
  const { t, locale } = useCommunity();
  const mutation = useMutation();
  const [priceDraft, setPriceDraft] = useState(String(listing?.price_from_kzt ?? ""));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const priceInput = useRef<HTMLInputElement>(null);
  const rejectedPriceEdit = useRef(false);
  const selectedPriceRange = useRef(false);
  function rejectPriceEdit() { rejectedPriceEdit.current = true; setPriceInvalid(true); }
  return <form className="cm-panel cm-editor" data-testid="listing-form" onSubmit={event => {
    event.preventDefault();
    const price = parseBudgetDraft(priceDraft);
    if (rejectedPriceEdit.current || priceInvalid || price === undefined || price > 100000000) {
      setPriceInvalid(true); priceInput.current?.focus(); return;
    }
    const data = new FormData(event.currentTarget);
    const input: ListingInput = { title: String(data.get("title")).trim(), category: String(data.get("category")), city: String(data.get("city")), price_from_kzt: price, description: String(data.get("description")).trim(), active: data.get("active") === "on" };
    void mutation.run(signal => communityApi.saveListing(input, listing?.id, signal), onSaved);
  }}>
    <h3>{listing ? t.editListing : t.newListing}</h3>
    <fieldset disabled={mutation.busy} className="cm-fields">
      <label>{t.listingTitle}<input name="title" defaultValue={listing?.title} required maxLength={120} pattern=".*\S.*" /></label>
      <div className="cm-form-grid"><label>{t.category}<select name="category" defaultValue={listing?.category ?? templates.services[0]?.category} required>{templates.services.map(s => <option key={s.category} value={s.category}>{s.label[locale]}</option>)}</select></label><label>{t.city}<select name="city" defaultValue={listing?.city ?? templates.cities[0]} required>{templates.cities.map(city => <option key={city} value={city}>{cityLabel(city, locale)}</option>)}</select></label></div>
      <label>{t.price}<input ref={priceInput} type="text" name="price" required inputMode="numeric" value={priceDraft} aria-invalid={priceInvalid} aria-describedby="cm-price-hint cm-price-error" onSelect={e => {
        // Touch selection has no keydown; remember it until the replacement input arrives.
        selectedPriceRange.current = e.currentTarget.selectionStart !== e.currentTarget.selectionEnd;
      }} onKeyDown={e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Backspace" || e.key === "Delete") rejectedPriceEdit.current = false;
        if (e.key.length !== 1) return;
        const replacing = e.currentTarget.selectionStart !== e.currentTarget.selectionEnd;
        if (!acceptBudgetDraft(e.key) || (rejectedPriceEdit.current && priceDraft !== "" && !replacing)) {
          e.preventDefault(); rejectPriceEdit();
        } else if (replacing) rejectedPriceEdit.current = false;
      }} onPaste={e => {
        const input = e.currentTarget;
        const proposed = input.value.slice(0, input.selectionStart ?? 0) + e.clipboardData.getData("text") + input.value.slice(input.selectionEnd ?? input.value.length);
        if (!acceptBudgetDraft(proposed) || (/[ \u00a0\u202f]/.test(proposed) && parseBudgetDraft(proposed) === undefined)) {
          e.preventDefault(); rejectPriceEdit();
        } else rejectedPriceEdit.current = false;
      }} onChange={e => {
        const proposed = e.target.value;
        const replacing = selectedPriceRange.current;
        selectedPriceRange.current = false;
        if (!acceptBudgetDraft(proposed)) { rejectPriceEdit(); return; }
        // Covers mobile/IME input without keydown. Keep a rejected nonempty prefix
        // blocked until an intentional correction, so sequential '4e2' cannot become 42.
        if (rejectedPriceEdit.current && priceDraft !== "" && proposed !== "" && proposed.length >= priceDraft.length && !replacing) {
          rejectPriceEdit(); return;
        }
        rejectedPriceEdit.current = false;
        setPriceDraft(proposed); setPriceInvalid(false);
      }} /><small id="cm-price-hint">{t.priceHint}</small>{priceInvalid && <span className="cm-field-error" id="cm-price-error" role="alert">{t.priceInvalid}</span>}</label>
      <label>{t.description}<textarea name="description" required minLength={20} maxLength={2000} rows={4} defaultValue={listing?.description} aria-describedby="cm-description-hint" /><small id="cm-description-hint">{t.descriptionHint}</small></label>
      <label className="cm-check"><input name="active" type="checkbox" defaultChecked={listing?.active ?? true} />{t.active}</label>
      {listing && <p className="cm-notice">{t.listingEditWarning}</p>}
      <div className="cm-actions"><button type="submit" className="cm-button">{mutation.busy ? t.saving : listing ? t.save : t.publish}</button><button type="button" className="cm-button cm-secondary" onClick={onCancel}>{t.cancel}</button></div>
    </fieldset><ErrorNotice error={mutation.error} />
  </form>;
}
