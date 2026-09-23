import { useEffect, useState } from "react";
import { useCommunity } from "./shared";
import type { EventDetail, Slot, Templates } from "./types";

/** Mirrors server consent semantics: done flags describe progress, not service scope. */
export function planScope(slots: Slot[]) {
  return JSON.stringify(slots.map(slot => ({ id: slot.id, category: slot.category, notes: slot.notes, checklist: slot.checklist.map(task => task.text) })));
}

export function PlanEditor({ event, templates, busy, onSave, onCancel }: {
  event: EventDetail; templates: Templates; busy: boolean;
  onSave: (slots: Slot[], version: number, scopeChanged: boolean) => void; onCancel: () => void;
}) {
  const { t, locale } = useCommunity();
  // A separate snapshot is deliberate: polling updates the team, never the user's draft.
  const [base] = useState(() => ({ version: event.version, slots: event.slots }));
  const [slots, setSlots] = useState<Slot[]>(() => event.slots.map(s => ({ ...s, checklist: s.checklist.map(task => ({ ...task })) })));
  const [newCategory, setNewCategory] = useState(templates.services[0]?.category ?? "");
  const dirty = JSON.stringify(slots) !== JSON.stringify(base.slots);
  const scopeChanged = planScope(slots) !== planScope(base.slots);
  const conflict = event.version !== base.version;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(slotId: string, change: Partial<Slot>) { setSlots(current => current.map(slot => slot.id === slotId ? { ...slot, ...change } : slot)); }
  return <form className="cm-plan-editor" onSubmit={e => { e.preventDefault(); if (dirty && !conflict) onSave(slots, base.version, scopeChanged); }}>
    {conflict && <div className="cm-notice cm-error" role="alert"><p>{t.changedElsewhere}</p><button type="button" className="cm-link" onClick={onCancel} disabled={busy}>{t.discard}</button></div>}
    <fieldset disabled={busy} className="cm-fields">
      {slots.map((slot, slotIndex) => <section className="cm-slot cm-slot-edit" key={slot.id} data-testid="event-slot">
        <div className="cm-slot-heading"><span className="cm-slot-number">{String(slotIndex + 1).padStart(2, "0")}</span><label className="cm-grow">{t.category}<select value={slot.category} onChange={e => update(slot.id, { category: e.target.value })}>{templates.services.map(service => <option key={service.category} value={service.category}>{service.label[locale]}</option>)}</select></label><button type="button" className="cm-icon-button cm-danger" aria-label={`${t.removeService} ${slotIndex + 1}`} onClick={() => setSlots(current => current.filter(s => s.id !== slot.id))}>×</button></div>
        <label>{t.notes}<textarea value={slot.notes} rows={3} maxLength={1000} placeholder={t.notesPlaceholder} onChange={e => update(slot.id, { notes: e.target.value })} /></label>
        <div className="cm-task-header"><h4>{t.tasks}</h4><span>{slot.checklist.length}/15</span></div>
        <div className="cm-task-list">{slot.checklist.map((task, index) => <div key={index} className="cm-task-edit"><label className="cm-check-hit"><input type="checkbox" checked={task.done} aria-label={`${t.completeTask} ${slotIndex + 1}.${index + 1}`} onChange={e => update(slot.id, { checklist: slot.checklist.map((item, i) => i === index ? { ...item, done: e.target.checked } : item) })} /></label><input value={task.text} aria-label={`${t.taskText} ${slotIndex + 1}.${index + 1}`} required maxLength={120} pattern=".*\S.*" onChange={e => update(slot.id, { checklist: slot.checklist.map((item, i) => i === index ? { ...item, text: e.target.value } : item) })} /><button type="button" className="cm-icon-button" aria-label={`${t.removeTask} ${slotIndex + 1}.${index + 1}`} onClick={() => update(slot.id, { checklist: slot.checklist.filter((_, i) => i !== index) })}>×</button></div>)}</div>
        <button type="button" className="cm-link" disabled={slot.checklist.length >= 15} onClick={() => update(slot.id, { checklist: [...slot.checklist, { text: "", done: false }] })}>+ {t.addTask}</button>
      </section>)}
      {!slots.length && <p className="cm-muted">{t.noSlots}</p>}
      <div className="cm-add-service"><label>{t.category}<select value={newCategory} onChange={e => setNewCategory(e.target.value)}>{templates.services.map(service => <option key={service.category} value={service.category}>{service.label[locale]}</option>)}</select></label><button type="button" className="cm-button cm-secondary" disabled={slots.length >= 30 || !newCategory} onClick={() => {
        const service = templates.services.find(item => item.category === newCategory);
        setSlots(current => [...current, { id: crypto.randomUUID(), category: newCategory, notes: "", checklist: (service?.checklist[locale] ?? []).map(text => ({ text, done: false })) }]);
      }}>+ {t.addService}</button><span className="cm-muted">{slots.length}/30</span></div>
      <p className={`cm-notice ${scopeChanged ? "cm-warning" : ""}`}>{scopeChanged ? t.resetWarning : t.progressOnly}</p>
      <div className="cm-editor-footer"><div>{dirty && <span className="cm-muted">{t.unsaved}</span>}<div className="cm-actions"><button type="submit" data-testid="plan-save" className="cm-button" disabled={!dirty || conflict}>{busy ? t.saving : scopeChanged ? t.savePlan : t.save}</button><button type="button" className="cm-button cm-secondary" onClick={onCancel}>{t.cancel}</button></div></div></div>
    </fieldset>
  </form>;
}
