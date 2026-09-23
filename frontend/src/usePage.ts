import { useEffect, useState } from "react";

export type Page = "home" | "match" | "providers" | "events" | "account";

// Public routes do not depend on a session; only community actions own authentication.
const currentPage = (): Page => {
  switch (window.location.hash) {
    case "#/match": return "match";
    case "#/providers": return "providers";
    case "#/events": return "events";
    case "#/account": return "account";
    default: return "home";
  }
};

export function usePage() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    let frame: number | undefined;
    const navigate = () => {
      setPage(currentPage()); // Back/forward and direct links share the same route source.
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.getElementById(window.location.hash === "#/how" ? "how-it-works" : "content");
        target?.scrollIntoView?.(); // Keep navigation predictable; tolerate nonvisual test environments.
        if (window.location.hash !== "#/how") target?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("hashchange", navigate);
    if (window.location.hash === "#/how") navigate(); // Direct help links also reach their section.
    return () => {
      window.removeEventListener("hashchange", navigate);
      if (frame !== undefined) cancelAnimationFrame(frame);
    }; // StrictMode must not duplicate listeners or leave delayed focus changes.
  }, []);
  return page;
}
