import { useState } from "react";
import { communityApi, CommunityApiError } from "./api";
import { cityLabel, eventDate, serviceLabel } from "./copy";
import { InvitationPanel } from "./Invitations";
import { PlanEditor } from "./PlanEditor";
import { ErrorNotice, Loading, SectionHeading, useCommunity, useMutation } from "./shared";
import { TeamChat } from "./TeamChat";
import type { EventDetail, Templates } from "./types";
import { useEventDetail } from "./useEventDetail";

export function EventWorkspace({ eventId, templates, onBack }: { eventId: string; templates: Templates | null; onBack: () => void }) {
  const { t, locale, user } = useCommunity();
  const event = useEventDetail(eventId);
  const mutation = useMutation();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  function mutate(work: (signal: AbortSignal) => Promise<EventDetail>, successText: string, after?: () => void) {
    setNotice("");
    void mutation.run(work, result => { event.commit(result); setNotice(successText); after?.(); }, cause => {
      // Re-read permissions and version on rejection; the editor keeps its own draft.
      if (cause instanceof CommunityApiError && [403, 404, 409, 422].includes(cause.status)) event.refresh();
    });
  }
  const detail = event.detail;
  const confirmed = detail?.slots.filter(slot => detail.invitations.some(invitation => invitation.slot_id === slot.id && invitation.status === "accepted" && invitation.version === detail.version)).length ?? 0;
  const owner = detail?.owner_id === user?.id;
  return <div data-testid="event-detail">
    <button className="cm-link cm-back" onClick={onBack} disabled={editing || mutation.busy}>← {t.back}</button>
    <ErrorNotice error={event.error} retry={event.refresh} />
    {event.loading && <Loading />}
    {detail && <>
      <header className="cm-event-header"><div><p className="cm-eyebrow">{t.community} / {t.version} {detail.version}</p><h1>{detail.title}</h1><p className="cm-lede">{cityLabel(detail.city, locale)} · {eventDate(detail.event_date, locale)}</p><p className="cm-muted">{t.owner}: {detail.owner_name}</p></div><span className="cm-event-flower" aria-hidden="true">✳</span></header>
      <div className={`cm-readiness ${detail.team_ready ? "cm-ready" : ""}`}><div><span className="cm-readiness-icon" aria-hidden="true">{detail.team_ready ? "✓" : "◔"}</span><div><h2>{detail.team_ready ? t.teamReady : t.teamPending}</h2><p>{t.readinessHint}</p></div></div><span className="cm-readiness-count"><strong>{confirmed}<span>/{detail.slots.length}</span></strong>{t.confirmed}</span><progress value={confirmed} max={Math.max(1, detail.slots.length)} aria-label={`${confirmed} ${t.of} ${detail.slots.length} ${t.confirmed}`} /></div>
      <p className="cm-footnote cm-coordination">{t.coordinationNote}</p>
      {notice && <p className="cm-notice cm-success" role="status">{notice}</p>}
      <ErrorNotice error={mutation.error} />
      <div className="cm-workspace-grid"><section aria-label={t.plan}><SectionHeading title={t.plan} action={owner && !editing && <button className="cm-button cm-secondary cm-small" disabled={!templates || mutation.busy} onClick={() => { setEditing(true); setNotice(""); mutation.clearError(); }}>{t.editPlan}</button>} />
        {editing && templates ? <PlanEditor event={detail} templates={templates} busy={mutation.busy} onCancel={() => { setEditing(false); mutation.clearError(); }} onSave={(slots, version, scopeChanged) => mutate(signal => communityApi.plan(detail.id, version, slots, signal), scopeChanged ? t.planSaved : t.progressSaved, () => setEditing(false))} /> : <div className="cm-slots">
          {!detail.slots.length && <div className="cm-panel cm-muted">{t.noSlots}</div>}
          {detail.slots.map((slot, index) => <section className="cm-slot" key={slot.id} data-testid="event-slot"><div className="cm-slot-heading"><span className="cm-slot-number">{String(index + 1).padStart(2, "0")}</span><h3>{serviceLabel(slot.category, templates, locale)}</h3><span className="cm-task-count">{slot.checklist.filter(task => task.done).length}/{slot.checklist.length}</span></div>
            {slot.notes && <p className="cm-slot-notes">{slot.notes}</p>}
            {slot.checklist.length ? <ul className="cm-checklist">{slot.checklist.map((task, i) => <li key={i} className={task.done ? "cm-done" : ""}><input type="checkbox" checked={task.done} disabled aria-label={task.text} /><span>{task.text}</span></li>)}</ul> : <p className="cm-muted">{t.noTasks}</p>}
            <InvitationPanel event={detail} slot={slot} busy={mutation.busy} onAction={mutate} />
          </section>)}
        </div>}
      </section><aside className="cm-workspace-side"><TeamChat event={detail} onMessage={event.appendMessage} onRevoked={event.revokeChat} />{editing && <p className="cm-footnote">{t.saveBeforeInvite}</p>}</aside></div>
    </>}
  </div>;
}
