import { useState } from "react";
import { communityApi } from "./api";
import { money } from "./copy";
import { ErrorNotice, Loading, useCommunity, useQuery } from "./shared";
import type { EventDetail, Invitation, Slot } from "./types";

export type EventAction = (work: (signal: AbortSignal) => Promise<EventDetail>, notice: string, after?: () => void) => void;

export function InvitationPanel({ event, slot, busy, onAction }: { event: EventDetail; slot: Slot; busy: boolean; onAction: EventAction }) {
  const { t, user, locale } = useCommunity();
  const invitation = event.invitations.find(item => item.slot_id === slot.id);
  const owner = event.owner_id === user?.id;
  const mine = invitation?.user_id === user?.id;
  const [choosing, setChoosing] = useState(false);
  const current = invitation?.version === event.version;
  return <div className="cm-invitation" data-testid="event-invitation">
    <div className="cm-row cm-spread"><div>{invitation ? <><strong>{invitation.provider_name}</strong><p className="cm-invitation-title">{invitation.listing_title}</p></> : <span className="cm-muted">{t.noInvite}</span>}</div>{invitation && <InvitationBadge invitation={invitation} version={event.version} />}</div>
    {invitation?.price_from_kzt !== undefined && <p className="cm-invitation-price">{t.from} {money(invitation.price_from_kzt, locale)}</p>}
    {invitation?.listing_description && <details className="cm-offer-details"><summary>{t.offerDetails}</summary><p>{invitation.listing_description}</p></details>}
    {mine && invitation && <div className="cm-your-invitation"><p><strong>{t.invitationForYou}</strong> · {t.version} {event.version}</p>{(invitation.status !== "accepted" || !current) && <p className="cm-muted">{t.reconfirm}</p>}<div className="cm-actions">
      {(invitation.status !== "accepted" || !current) && <button className="cm-button cm-small" disabled={busy} onClick={() => onAction(signal => communityApi.respond(event.id, slot.id, "accepted", event.version, signal), t.responseSaved)}>{t.accept}</button>}
      {invitation.status !== "declined" && <button className="cm-button cm-secondary cm-small" disabled={busy} onClick={() => onAction(signal => communityApi.respond(event.id, slot.id, "declined", event.version, signal), t.responseSaved)}>{invitation.status === "accepted" ? t.leave : t.decline}</button>}
    </div></div>}
    {owner && <>{choosing ? <InvitePicker event={event} slot={slot} busy={busy} onCancel={() => setChoosing(false)} onAction={onAction} /> : <button className="cm-link cm-invite-link" disabled={busy} onClick={() => setChoosing(true)}>{invitation ? t.replaceInvite : t.inviteProvider} <span aria-hidden="true">↗</span></button>}</>}
  </div>;
}

export function InvitationBadge({ invitation, version }: { invitation: Invitation; version: number }) {
  const { t } = useCommunity();
  const current = invitation.version === version;
  return <span className={`cm-badge ${invitation.status === "accepted" && current ? "cm-badge-green" : invitation.status === "declined" ? "cm-badge-red" : "cm-badge-amber"}`}>{!current ? t.oldVersion : t[invitation.status]}</span>;
}

function InvitePicker({ event, slot, busy, onCancel, onAction }: { event: EventDetail; slot: Slot; busy: boolean; onCancel: () => void; onAction: EventAction }) {
  const { t, locale } = useCommunity();
  const candidates = useQuery(`invite:${event.id}:${slot.id}:${slot.category}:${event.city}`, signal => communityApi.listings({ city: event.city, category: slot.category }, signal));
  const [listingId, setListingId] = useState("");
  return <form className="cm-invite-picker" onSubmit={e => { e.preventDefault(); if (listingId) onAction(signal => communityApi.invite(event.id, slot.id, listingId, event.version, signal), t.inviteSaved, onCancel); }}>
    <ErrorNotice error={candidates.error} retry={candidates.reload} />
    {candidates.loading ? <Loading /> : candidates.data && (candidates.data.listings.length ? <label>{t.chooseProvider}<select value={listingId} onChange={e => setListingId(e.target.value)} required disabled={busy}><option value="">{t.selectProvider}</option>{candidates.data.listings.map(listing => <option key={listing.id} value={listing.id}>{listing.provider_name} · {listing.title} · {t.from.toLocaleLowerCase()} {money(listing.price_from_kzt, locale)}</option>)}</select></label> : <p className="cm-muted">{t.noCandidates} <a href="#/providers">{t.providers} ↗</a></p>)}
    {candidates.data && candidates.data.listings.length >= 200 && <p className="cm-footnote">{t.directoryLimit}</p>}
    {event.invitations.some(invitation => invitation.slot_id === slot.id) && <p className="cm-footnote">{t.replaceInviteWarning}</p>}
    <div className="cm-actions"><button className="cm-button cm-small" type="submit" disabled={busy || !listingId || !candidates.data?.listings.some(l => l.id === listingId)}>{busy ? t.saving : t.sendInvite}</button><button className="cm-link" type="button" onClick={onCancel} disabled={busy}>{t.cancel}</button></div>
  </form>;
}
