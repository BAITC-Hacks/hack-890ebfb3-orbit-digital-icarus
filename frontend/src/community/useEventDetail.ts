import { useCallback, useEffect, useRef, useState } from "react";
import { communityApi, CommunityApiError } from "./api";
import { useCommunity } from "./shared";
import type { EventDetail, Message } from "./types";

/** Polls are sequential and never allowed to supersede a newer local mutation. */
export function useEventDetail(eventId: string) {
  const { expireSession } = useCommunity();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => { generation.current += 1; setRefreshCount(n => n + 1); }, []);
  const commit = useCallback((next: EventDetail) => {
    generation.current += 1;
    setDetail(next); setError(null); setLoading(false);
  }, []);
  const appendMessage = useCallback((message: Message) => {
    generation.current += 1;
    setDetail(previous => previous?.can_chat ? { ...previous, messages: [...previous.messages.filter(m => m.id !== message.id), message].sort((a, b) => a.id - b.id).slice(-100) } : previous);
  }, []);
  const revokeChat = useCallback(() => {
    generation.current += 1;
    setDetail(previous => previous ? { ...previous, can_chat: false, messages: [] } : null);
    setRefreshCount(n => n + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const requestGeneration = generation.current;
      try {
        const next = await communityApi.event(eventId, controller.signal);
        if (!controller.signal.aborted && generation.current === requestGeneration) {
          setDetail(next); setError(null); setLoading(false);
        }
      } catch (cause) {
        if (!controller.signal.aborted && generation.current === requestGeneration) {
          if (cause instanceof CommunityApiError) {
            if (cause.status === 401) expireSession();
            if ([401, 403, 404].includes(cause.status)) setDetail(null);
          }
          setError(cause); setLoading(false);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => {
          // Resume promptly after a hidden tab returns, without background request churn.
          if (document.hidden) timer = setTimeout(poll, 5000);
          else void poll();
        }, 5000);
      }
    }
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    void poll();
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [eventId, expireSession, refreshCount, refresh]);
  return { detail, error, loading, refresh, commit, appendMessage, revokeChat };
}
