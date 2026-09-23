import type { MatchRequest, MatchResponse } from "./api/types";

export interface DateComparisonPair { previous: MatchResponse; current: MatchResponse }
export interface DateInsights {
  removed: Array<{ id: string; name: string; reason: "booked" | "out_ranked" }>;
  added: string[];
}

export function onlyDateChanged(previous: MatchRequest, current: MatchRequest): boolean {
  return previous.event_date !== current.event_date
    && previous.city === current.city && previous.category === current.category
    && previous.event_format === current.event_format && previous.budget_kzt === current.budget_kzt
    && (previous.duration_hours ?? null) === (current.duration_hours ?? null)
    && (previous.language ?? null) === (current.language ?? null);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sameIds = (value: unknown, expected: string[]): boolean => Array.isArray(value)
  && value.length === expected.length && value.every((id, index) => id === expected[index]);

export async function getDateInsights({ previous, current }: DateComparisonPair, signal: AbortSignal): Promise<DateInsights> {
  if (!onlyDateChanged(previous.request, current.request)) throw new Error("Comparison requires a date-only change");
  const response = await fetch("/api/insights/dates", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ previous: previous.request, current: current.request }),
  });
  if (!response.ok) throw new Error("Date comparison unavailable");
  const data: unknown = await response.json();
  const before = previous.cards.map(card => card.id);
  const after = current.cards.map(card => card.id);
  const removedIds = before.filter(id => !after.includes(id));
  const added = after.filter(id => !before.includes(id));
  // Do not attach reasons from a newer dataset or a different shortlist to visible cards.
  if (!isRecord(data) || data.previous_date !== previous.request.event_date || data.current_date !== current.request.event_date
    || data.dataset_version !== previous.dataset_version || data.dataset_version !== current.dataset_version
    || data.algorithm_version !== previous.algorithm_version || data.algorithm_version !== current.algorithm_version
    || !sameIds(data.previous_ids, before) || !sameIds(data.current_ids, after)
    || !sameIds(data.added, added) || !Array.isArray(data.removed) || data.removed.length !== removedIds.length) {
    throw new Error("Date comparison does not match the displayed results");
  }
  const removed: DateInsights["removed"] = data.removed.map((item: unknown, index: number) => {
    if (!isRecord(item) || item.id !== removedIds[index] || typeof item.name !== "string" || !item.name.trim()
      || (item.reason !== "booked" && item.reason !== "out_ranked")) throw new Error("Invalid date comparison reason");
    return { id: removedIds[index], name: item.name, reason: item.reason };
  });
  return { removed, added };
}
