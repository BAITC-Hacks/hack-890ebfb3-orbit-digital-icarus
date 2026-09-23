import { useEffect, useRef, useState } from "react";
import { displayDate, type Locale } from "./i18n";
import { getDateInsights, type DateComparisonPair, type DateInsights } from "./dateInsights";

const copy = {
  ru: {
    title: "Что изменилось с датой", loading: "Сравниваем списки по предоставленному календарю…",
    unavailable: "Не удалось проверить причины изменения списка. Текущий результат подбора остаётся действительным для предоставленных данных.",
    booked: "занят на новую дату по предоставленному календарю",
    out_ranked: "по-прежнему подходит; другие подходящие профили получили более высокие места в новом списке",
    unchanged: "Состав короткого списка не изменился.", added: "Теперь в списке", note: "Сравнение по снимку данных; актуальную доступность нужно подтвердить.",
  },
  en: {
    title: "What changed with the date", loading: "Comparing shortlists against the supplied calendar…",
    unavailable: "Could not verify why the shortlist changed. Your current matching result still applies to the supplied data.",
    booked: "booked on the new date in the supplied calendar",
    out_ranked: "still eligible; other eligible profiles ranked higher in the new shortlist",
    unchanged: "The shortlist contains the same profiles.", added: "Now in the shortlist", note: "Compared against a data snapshot; confirm current availability directly.",
  },
};

export function DateComparison({ comparison, locale }: { comparison: DateComparisonPair; locale: Locale }) {
  const [outcome, setOutcome] = useState<{ pair: DateComparisonPair; insights: DateInsights | null } | null>(null);
  const generation = useRef(0);
  const t = copy[locale];

  useEffect(() => {
    const run = ++generation.current;
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 10_000);
    // This auxiliary request cannot set matching errors or replace the returned cards.
    void getDateInsights(comparison, controller.signal).then(insights => {
      if (run === generation.current) setOutcome({ pair: comparison, insights });
    }).catch(() => {
      if (run === generation.current) setOutcome({ pair: comparison, insights: null });
    }).finally(() => window.clearTimeout(deadline));
    return () => { ++generation.current; controller.abort(); window.clearTimeout(deadline); };
  }, [comparison]); // Changing the interface language only translates an existing comparison.

  const ready = outcome?.pair === comparison;
  const insights = ready ? outcome.insights : null;
  const addedNames = insights?.added.map(id => comparison.current.cards.find(card => card.id === id)?.anon_name ?? id);
  return <aside className="date-comparison" data-testid="date-comparison" aria-labelledby="date-comparison-title" aria-live="polite">
    <h3 id="date-comparison-title">{t.title}</h3>
    <p>{displayDate(comparison.previous.request.event_date)} → {displayDate(comparison.current.request.event_date)}</p>
    {!ready ? <p role="status">{t.loading}</p> : !insights ? <p>{t.unavailable}</p> : <>
      {insights.removed.length > 0 && <ul>{insights.removed.map(item => <li key={item.id} data-reason={item.reason}><strong>{item.name}</strong> ({item.id}) — {t[item.reason]}.</li>)}</ul>}
      {Boolean(addedNames?.length) && <p><strong>{t.added}:</strong> {addedNames!.join(", ")}.</p>}
      {!insights.removed.length && !insights.added.length && <p>{t.unchanged}</p>}
      <p className="comparison-note">{t.note}</p>
    </>}
  </aside>;
}
