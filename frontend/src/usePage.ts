import { useEffect, useState } from "react";

const currentPage = () => window.location.hash === "#/match" ? "match" : "home";

export function usePage() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const navigate = () => {
      setPage(currentPage());
      requestAnimationFrame(() => {
        const target = document.getElementById(window.location.hash === "#/how" ? "how-it-works" : "content");
        target?.scrollIntoView?.();
        if (window.location.hash !== "#/how") target?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("hashchange", navigate);
    if (window.location.hash === "#/how") navigate();
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  return page;
}
