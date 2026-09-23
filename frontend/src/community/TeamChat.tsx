import { useState } from "react";
import { communityApi, CommunityApiError } from "./api";
import { ErrorNotice, useCommunity, useMutation } from "./shared";
import type { EventDetail, Message } from "./types";

export function TeamChat({ event, onMessage, onRevoked }: { event: EventDetail; onMessage: (message: Message) => void; onRevoked: () => void }) {
  const { t, locale, user } = useCommunity();
  return <section className="cm-panel cm-chat" aria-labelledby="cm-chat-heading"><div className="cm-chat-heading"><span aria-hidden="true">◌</span><div><h2 id="cm-chat-heading">{t.chat}</h2><p>{t.chatHint}</p></div></div>
    {event.can_chat ? <>
      <div className="cm-chat-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label={t.chat}>
        {event.messages.length ? event.messages.map(message => <article className={`cm-message ${message.user_id === user?.id ? "cm-message-own" : ""}`} key={message.id} data-testid="chat-message"><div className="cm-message-meta"><strong>{message.display_name}</strong><time dateTime={message.created_at}>{new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))}</time></div><p>{message.text}</p></article>) : <p className="cm-chat-empty">{t.chatEmpty}</p>}
      </div>
      <p className="cm-footnote">{t.latestMessages}</p>
      <ChatForm eventId={event.id} onMessage={onMessage} onRevoked={onRevoked} />
    </> : <div className="cm-chat-locked"><span aria-hidden="true">⌁</span><p>{t.chatLocked}</p></div>}
  </section>;
}

function ChatForm({ eventId, onMessage, onRevoked }: { eventId: string; onMessage: (message: Message) => void; onRevoked: () => void }) {
  const { t } = useCommunity();
  const [text, setText] = useState("");
  const mutation = useMutation();
  return <form data-testid="chat-form" className="cm-chat-form" onSubmit={event => {
    event.preventDefault();
    if (!text.trim()) return;
    void mutation.run(signal => communityApi.send(eventId, text.trim(), signal), result => { onMessage(result.message); setText(""); }, cause => {
      if (cause instanceof CommunityApiError && [401, 403, 404].includes(cause.status)) onRevoked();
    });
  }}>
    <label>{t.message}<textarea value={text} maxLength={2000} rows={3} required disabled={mutation.busy} onChange={e => setText(e.target.value)} placeholder={t.messagePlaceholder} /></label>
    <div className="cm-row cm-spread"><span className="cm-muted cm-counter">{text.length}/2000</span><button className="cm-button cm-small" disabled={mutation.busy || !text.trim()}>{mutation.busy ? t.saving : t.send} <span aria-hidden="true">↑</span></button></div><ErrorNotice error={mutation.error} />
  </form>;
}
