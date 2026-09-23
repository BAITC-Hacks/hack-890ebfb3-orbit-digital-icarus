import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { communityApi, isCommunityEndpointUnavailable } from "./api";
import { AccountPage } from "./AccountPage";
import { copy } from "./copy";
import { EventsPage } from "./EventsPage";
import { ProvidersPage } from "./ProvidersPage";
import { CommunityContext, Loading, SignInGate, useCommunity, useMutation, useQuery } from "./shared";
import type { CommunityView, Locale, User } from "./types";
import "./community.css";

type Session = { page: CommunityView; user: User | null; status: "loading" | "ready" | "error"; error?: unknown };

/** Integration boundary: the parent supplies routing and locale; this subtree owns auth. */
export function CommunityPage({ locale, page }: { locale: Locale; page: CommunityView }) {
  const t = copy[locale];
  const pageRef = useRef(page); pageRef.current = page;
  const [session, setSession] = useState<Session>({ page, user: null, status: "loading" });
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const logout = useMutation(false);
  const sessionRequest = useRef<AbortController | null>(null);
  const expireSession = useCallback(() => {
    sessionRequest.current?.abort();
    setSession({ page: pageRef.current, user: null, status: "ready" });
    setSessionEpoch(n => n + 1); setExpired(true);
  }, []);
  useEffect(() => {
    if (logoutPending) return;
    const controller = new AbortController();
    sessionRequest.current = controller;
    setSession({ page, user: null, status: "loading" });
    communityApi.session(controller.signal).then(result => {
      if (!controller.signal.aborted) setSession({ page, user: result.user, status: "ready" });
    }).catch(error => {
      if (!controller.signal.aborted) setSession({ page, user: null, status: "error", error });
    });
    return () => controller.abort();
  }, [page, attempt, logoutPending]);

  const status = logoutPending ? "ready" : session.page === page ? session.status : "loading";
  const user = status === "ready" && !logoutPending ? session.user : null;
  const context = useMemo(() => ({ locale, user, expireSession }), [locale, user, expireSession]);
  const signOut = () => {
    // Remove the entire private subtree before awaiting the server, even if it is offline.
    sessionRequest.current?.abort();
    setSession({ page, user: null, status: "ready" });
    setSessionEpoch(n => n + 1); setLogoutPending(true); setExpired(false);
    void logout.run(signal => communityApi.logout(signal), () => { setLogoutPending(false); setAttempt(n => n + 1); });
  };
  return <CommunityContext.Provider value={context}><div className="cm" data-testid="community-page" lang={locale}>
    <nav className="cm-nav" aria-label={t.community}><div className="cm-nav-links">{(["providers", "events", "account"] as const).map(view => <a key={view} href={`#/${view}`} aria-current={view === page ? "page" : undefined}>{t[view]}</a>)}</div><div className="cm-session">{user ? <><span>{user.display_name}</span><button className="cm-link" onClick={signOut}>{t.signOut}</button></> : status === "loading" ? <span role="status">{t.sessionLoading}</span> : !logoutPending && <a href="#/account">{t.signIn} ↗</a>}</div></nav>
    {expired && <p className="cm-notice" role="status">{t.authError} <a href="#/account">{t.signIn}</a></p>}
    {status === "error" && <div className="cm-notice cm-error" role="alert"><span>{isCommunityEndpointUnavailable(session.error) ? t.endpointUnavailable : t.sessionError}</span><button className="cm-link" onClick={() => setAttempt(n => n + 1)}>{t.retry}</button></div>}
    {logoutPending && <div className={`cm-notice ${logout.error ? "cm-error" : ""}`} role={logout.error ? "alert" : "status"}>{logout.busy ? t.saving : <><span>{t.logoutError}</span><button className="cm-link" onClick={signOut}>{t.retryLogout}</button></>}</div>}
    <CommunityBody key={`${page}:${user?.id ?? "anonymous"}:${sessionEpoch}`} page={page} sessionReady={status === "ready" && !logoutPending} onSignedIn={signedIn => {
      setSession({ page: pageRef.current, user: signedIn, status: "ready" }); setExpired(false); setSessionEpoch(n => n + 1);
    }} />
  </div></CommunityContext.Provider>;
}

function CommunityBody({ page, sessionReady, onSignedIn }: { page: CommunityView; sessionReady: boolean; onSignedIn: (user: User) => void }) {
  const { locale, user } = useCommunity();
  const t = copy[locale];
  const templates = useQuery("templates", signal => communityApi.templates(signal));
  return <>
    {templates.error && <div className="cm-notice cm-error" role="alert"><span>{isCommunityEndpointUnavailable(templates.error) ? t.endpointUnavailable : t.templatesError}</span><button className="cm-link" onClick={templates.reload}>{t.retry}</button></div>}
    {page === "providers" ? <ProvidersPage templates={templates.data} /> : !sessionReady ? <Loading /> : page === "account" ? <AccountPage templates={templates.data} onSignedIn={onSignedIn} /> : user ? <EventsPage templates={templates.data} /> : <><header className="cm-page-header"><p className="cm-eyebrow">{t.community}</p><h1>{t.eventsTitle}</h1><p className="cm-lede">{t.eventsIntro}</p></header><SignInGate /></>}
  </>;
}
