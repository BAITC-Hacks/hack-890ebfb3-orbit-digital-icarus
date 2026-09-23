import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CommunityApiError, isCommunityEndpointUnavailable } from "./api";
import { copy } from "./copy";
import type { Locale, User } from "./types";

export const CommunityContext = createContext<{ locale: Locale; user: User | null; expireSession: () => void }>({ locale: "ru", user: null, expireSession: () => undefined });
export function useCommunity() { const context = useContext(CommunityContext); return { ...context, t: copy[context.locale] }; }

export function errorText(error: unknown, locale: Locale) {
  const t = copy[locale];
  if (!(error instanceof CommunityApiError)) return t.genericError;
  if (isCommunityEndpointUnavailable(error)) return t.endpointUnavailable;
  if (["invalid_credentials", "bad_credentials"].includes(error.code)) return t.credentialsError;
  if (["username_taken", "username_exists", "username_unavailable"].includes(error.code)) return t.usernameTaken;
  if (["listing_unavailable", "listing_mismatch", "invalid_listing", "listing_not_eligible", "listing_not_suitable"].includes(error.code)) return t.listingError;
  const specific: Record<string, string> = { listing_limit: t.listingLimit, event_limit: t.eventLimit, provider_required: t.providerRequired, owner_required: t.ownerRequired, accept_invitation_first: t.chatLocked, invitation_required: t.permissionError, origin_rejected: t.originError, json_required: t.formatError, request_too_large: t.validationError, storage_unavailable: t.storageError };
  if (specific[error.code]) return specific[error.code];
  if (error.code === "network") return t.networkError;
  if (error.status === 401) return t.authError;
  if (error.status === 403) return t.permissionError;
  if (error.status === 404) return t.missingError;
  if (error.status === 409) return t.conflictError;
  if (error.status === 422 || error.status === 400 || error.code === "validation") return t.validationError;
  if (error.status === 429) return t.rateError;
  return t.genericError;
}

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  const { locale, t } = useCommunity();
  if (!error) return null;
  return <div className="cm-notice cm-error" role="alert"><span>{errorText(error, locale)}</span>{retry && <button type="button" className="cm-link" onClick={retry}>{t.retry}</button>}</div>;
}

/** Every mutation has the same duplicate-submit, safe-error and unmount behavior. */
export function useMutation(expireOnUnauthorized = true) {
  const { expireSession } = useCommunity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const run = useCallback(async <T,>(work: (signal: AbortSignal) => Promise<T>, success: (value: T) => void, failure?: (cause: unknown) => void) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(null);
    try {
      const value = await work(controller.signal);
      if (!controller.signal.aborted) success(value);
    } catch (cause) {
      if (!controller.signal.aborted) {
        failure?.(cause);
        if (expireOnUnauthorized && cause instanceof CommunityApiError && cause.status === 401) expireSession();
        setError(cause);
      }
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }, [expireSession, expireOnUnauthorized]);
  return { busy, error, run, clearError: () => setError(null) };
}

/** The key hides stale data immediately, before the previous request is aborted. */
export function useQuery<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>) {
  const { expireSession } = useCommunity();
  const loader = useRef(fetcher); loader.current = fetcher;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: unknown; loading: boolean }>({ key, data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, data: null, error: null, loading: true });
    loader.current(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data, error: null, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) {
        if (error instanceof CommunityApiError && error.status === 401) expireSession();
        setState({ key, data: null, error, loading: false });
      }
    });
    return () => controller.abort();
  }, [key, attempt, expireSession]);
  return { ...(state.key === key ? state : { data: null, error: null, loading: true }), reload: useCallback(() => setAttempt(n => n + 1), []) };
}

export function Loading() { const { t } = useCommunity(); return <p className="cm-loading" role="status"><span className="cm-spinner" aria-hidden="true" />{t.loading}</p>; }
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="cm-empty"><span className="cm-empty-mark" aria-hidden="true">✳</span><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export function SignInGate() {
  const { t } = useCommunity();
  return <EmptyState title={t.gateTitle} action={<a className="cm-button" href="#/account">{t.signIn} <span aria-hidden="true">↗</span></a>}>{t.gateBody}</EmptyState>;
}
export function SectionHeading({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="cm-section-heading"><div><h2>{title}</h2>{children && <p>{children}</p>}</div>{action}</div>;
}
