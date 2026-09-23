import { useEffect, useState } from "react";

// Hash routes work on static hosts without introducing a routing dependency.
const currentPage = () => window.location.hash === "#/match" ? "match" : "home";

export function usePage() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const navigate = () => {
      setPage(currentPage()); // Back/forward and direct links share the same route source.
      requestAnimationFrame(() => {
        const target = document.getElementById(window.location.hash === "#/how" ? "how-it-works" : "content");
        target?.scrollIntoView?.(); // Keep navigation predictable; tolerate nonvisual test environments.
        if (window.location.hash !== "#/how") target?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("hashchange", navigate);
    if (window.location.hash === "#/how") navigate(); // Direct help links also reach their section.
    return () => window.removeEventListener("hashchange", navigate); // StrictMode must not duplicate listeners.
  }, []);
  return page;
}
