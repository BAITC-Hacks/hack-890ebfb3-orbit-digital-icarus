import { useRef, useState } from "react";
import type { MatchCard, MatchRequest } from "../api/types";
import { copy, displayDate, formatMoney, optionLabel, type Locale } from "../i18n";
import { journeyCopy } from "../journeyCopy";

/** Derive the inquiry from the returned request, never unsent/edited form state. */
export function buildInquiry(card: MatchCard, request: MatchRequest, locale: Locale): string {
  const t = copy[locale]; // Reuse the same labels and formatters as the result cards.
  const unspecified = locale === "ru" ? "не указано" : "not specified";
  return [
    locale === "ru" ? `Здравствуйте! Интересует профиль ${card.anon_name} (${card.id}).` : `Hello! I am interested in ${card.anon_name} (${card.id}).`,
    `${t.category}: ${optionLabel(request.category, locale)}`,
    `${t.city}: ${optionLabel(request.city, locale)}`,
    `${t.event_date}: ${displayDate(request.event_date)}`,
    `${t.event_format}: ${optionLabel(request.event_format, locale)}`,
    `${t.budget_kzt}: ${formatMoney(request.budget_kzt, locale)}`,
    `${t.duration_hours}: ${request.duration_hours ?? unspecified}`,
    `${t.language}: ${request.language ? optionLabel(request.language, locale) : unspecified}`,
    locale === "ru" ? "Подтвердите, пожалуйста, актуальную доступность, итоговую стоимость и что входит в услугу. Это запрос, не бронирование." : "Please confirm current availability, your final quote and what is included. This is an inquiry, not a booking.",
  ].join("\n"); // Plain text works in any communication channel the user later verifies.
}

// Native details supplies disclosure keyboard behavior without a modal dependency.
export function ContactPanel({ card, request, locale }: { card: MatchCard; request: MatchRequest; locale: Locale }) {
  const t = journeyCopy[locale];
  const draft = buildInquiry(card, request, locale); // No contractor contact is guessed or generated.
  const textarea = useRef<HTMLTextAreaElement>(null); // Manual selection remains available without clipboard permission.
  const [copyResult, setCopyResult] = useState<{ draft: string; status: "copied" | "manual" } | null>(null);
  async function copyInquiry() {
    try {
      await navigator.clipboard.writeText(draft); // Only this explicit click writes to the user's clipboard.
      setCopyResult({ draft, status: "copied" }); // A copy is never reported as delivery or a booking.
    } catch {
      textarea.current?.focus(); // Permissions and non-secure origins can disable the clipboard API.
      textarea.current?.select();
      setCopyResult({ draft, status: "manual" }); // Keep the useful draft visible when automatic copy fails.
    }
  }
  return <details className="contact-panel" data-testid="contact-panel">
    <summary>{t.contact}</summary>
    <p>{t.contactNotice}</p>
    <label>{t.draft}<textarea ref={textarea} rows={10} readOnly value={draft} /></label>
    <button type="button" className="copy-inquiry" onClick={() => void copyInquiry()}>{t.copy}</button>
    {/* A locale/request change invalidates old copy feedback without an effect or extra state. */}
    <p role="status">{copyResult?.draft === draft ? t[copyResult.status] : ""}</p>
  </details>;
}
