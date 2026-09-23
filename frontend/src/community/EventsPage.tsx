import { useState } from "react";
import { communityApi } from "./api";
import { cityLabel, eventDate } from "./copy";
import { EventWorkspace } from "./EventWorkspace";
import { EmptyState, ErrorNotice, Loading, SectionHeading, useCommunity, useMutation, useQuery } from "./shared";
import type { EventDetail, Templates } from "./types";

export function EventsPage({ templates }: { templates: Templates | null }) {
  const { t, locale, user } = useCommunity();
  const events = useQuery(`events:${user?.id}`, signal => communityApi.events(signal));
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (selected) return <EventWorkspace key={selected} eventId={selected} templates={templates} onBack={() => { setSelected(null); events.reload(); }} />;
  return <>
    <header className="cm-page-header"><p className="cm-eyebrow">{t.community}</p><h1>{t.eventsTitle}</h1><p className="cm-lede">{t.eventsIntro}</p></header>
    <SectionHeading title={t.events} action={<button className="cm-button" disabled={!templates || creating} onClick={() => setCreating(true)}>{t.newEvent} +</button>} />
    {creating && templates && <EventForm templates={templates} onCancel={() => setCreating(false)} onCreated={event => { setCreating(false); setSelected(event.id); }} />}
    <ErrorNotice error={events.error} retry={events.reload} />
    {events.loading ? <Loading /> : !events.error && (events.data?.events.length ? <div className="cm-event-grid">{events.data.events.map(event => <button key={event.id} className="cm-event-card" onClick={() => setSelected(event.id)}>
      <div className="cm-row cm-spread"><span className="cm-eyebrow">{event.owner_id === user?.id ? t.yourEvent : t.invitedEvent}</span><span aria-hidden="true">↗</span></div><h2>{event.title}</h2><p>{cityLabel(event.city, locale)} · {eventDate(event.event_date, locale)}</p><div className={`cm-badge ${event.team_ready ? "cm-badge-green" : "cm-badge-amber"}`}>{event.team_ready ? t.teamReady : t.teamPending}</div><span className="cm-event-open">{t.openEvent} →</span>
    </button>)}</div> : !creating && <EmptyState title={t.noEvents}>{t.noEventsBody}</EmptyState>)}
    <div className="cm-trust-note"><span aria-hidden="true">ⓘ</span><p>{t.coordinationNote}</p></div>
  </>;
}

function EventForm({ templates, onCancel, onCreated }: { templates: Templates; onCancel: () => void; onCreated: (event: EventDetail) => void }) {
  const { t, locale } = useCommunity();
  const [templateId, setTemplateId] = useState(templates.events[0]?.id ?? "");
  const mutation = useMutation();
  const template = templates.events.find(item => item.id === templateId);
  return <form className="cm-panel cm-editor" data-testid="event-form" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutation.run(signal => communityApi.createEvent({ title: String(data.get("title")).trim(), city: String(data.get("city")), event_date: String(data.get("event_date")), template_id: templateId, locale }, signal), onCreated);
  }}>
    <h3>{t.newEvent}</h3><fieldset className="cm-fields" disabled={mutation.busy}>
      <label>{t.eventTitle}<input name="title" required maxLength={120} pattern=".*\S.*" /></label>
      <div className="cm-form-grid"><label>{t.city}<select name="city" required>{templates.cities.map(city => <option key={city} value={city}>{cityLabel(city, locale)}</option>)}</select></label><label>{t.date}<input name="event_date" type="date" required min="2026-01-01" max="2035-12-31" aria-describedby="cm-date-hint" /><small id="cm-date-hint">{t.dateHint}</small></label></div>
      <label>{t.template}<select name="template_id" value={templateId} onChange={e => setTemplateId(e.target.value)} required>{templates.events.map(item => <option key={item.id} value={item.id}>{item.label[locale]}</option>)}</select><small>{t.templateHint}</small></label>
      {template && <div className="cm-tags">{template.services.map(category => <span className="cm-tag" key={category}>{templates.services.find(s => s.category === category)?.label[locale] ?? category}</span>)}</div>}
      <div className="cm-actions"><button type="submit" className="cm-button">{mutation.busy ? t.saving : t.create}</button><button type="button" className="cm-button cm-secondary" onClick={onCancel}>{t.cancel}</button></div>
    </fieldset><ErrorNotice error={mutation.error} />
  </form>;
}
