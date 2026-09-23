import { describe, expect, it } from "vitest";
import { metadata } from "../api/demo";
import type { MatchCard, MatchRequest, MatchResponse } from "../api/types";
import {
  availabilityLabel, calendarLabel, cardExplanation, exclusionSummary, initialLocale,
  invalidFields, optionLabel, resultSummary, resultTitle, translatedQuote,
} from "./index";

const request: MatchRequest = {
  city: "Алматы", event_date: "2026-10-11", event_format: "свадьба", category: "Ведущий",
  budget_kzt: 3_000_000, duration_hours: null, language: null,
};
const quote = "Опыт ведения свадеб 13 лет";
const profile: MatchCard = {
  id: "HK-42352", anon_name: "Эмилия", category: "Ведущий", categories: ["Ведущий"], city: "Алматы",
  price_from_kzt: 900_000, event_date: request.event_date, availability: "free_in_dataset",
  synthetic: false, source_kind: "provided", price_imputed: true, city_imputed: false,
  explanation: "Точное объяснение от API. В профиле указан опыт ведения свадеб.",
  evidence: [{ code: "description", field: "description", value: quote, source_quote: quote }],
};

const result: MatchResponse = {
  schema_version: "1", status: "matches_found", request: { ...request, duration_hours: null, language: null },
  dataset_version: "test", algorithm_version: "test", message: "Русский текст от API.",
  counts: { city_category_total: 2, eligible_total: 1, returned_total: 1 },
  exclusions: { booked: 0, over_budget: 1, unsupported_format: 0, unsupported_language: 0, duration_exceeded: 0 },
  cards: [profile],
};

describe("interface locale", () => {
  it("rejects a duration above the request ceiling while accepting the boundary and omission", () => {
    for (const duration_hours of [12.0001, 13, 4903]) expect(invalidFields({ ...request, duration_hours }, metadata)).toContain("duration_hours");
    for (const duration_hours of [null, 0.5, 12]) expect(invalidFields({ ...request, duration_hours }, metadata)).not.toContain("duration_hours");
  });

  it("defaults to Russian and respects only a stored English preference", () => {
    expect(initialLocale()).toBe("ru");
    expect(initialLocale({ getItem: () => "en" })).toBe("en");
    expect(initialLocale({ getItem: () => "ru" })).toBe("ru");
    expect(initialLocale({ getItem: () => "unsupported" })).toBe("ru");
  });

  it("keeps Russian usable when browser storage is unavailable", () => {
    expect(initialLocale({ getItem: () => { throw new Error("storage disabled"); } })).toBe("ru");
  });

  it("translates all 17 categories and every canonical city, format and working language", () => {
    expect(metadata.categories).toHaveLength(17);
    const canonical = [...metadata.categories, ...metadata.cities, ...metadata.event_formats, ...metadata.languages];
    for (const value of canonical) {
      expect(optionLabel(value, "ru")).toBe(value);
      expect(optionLabel(value, "en")).not.toBe(value);
      expect(optionLabel(value, "en")).not.toMatch(/[А-Яа-яЁё]/);
    }
  });

  it("labels unknown source values honestly instead of fabricating a translation", () => {
    expect(optionLabel("Новая категория", "en")).toBe("Новая категория");
  });

  it("changes display text without altering canonical request data", () => {
    const before = structuredClone(request);
    optionLabel(request.city, "en");
    cardExplanation(profile, request, "en");
    expect(request).toEqual(before);
    expect(request.language).toBeNull();
  });
});

describe("grounded translated explanations", () => {
  it("preserves Russian server prose exactly", () => {
    expect(cardExplanation(profile, request, "ru")).toBe(profile.explanation);
    expect(resultSummary(result, "ru")).toBe(result.message);
  });

  it("renders known description translations and actual request/price facts", () => {
    const explanation = cardExplanation(profile, request, "en");
    expect(explanation).toContain(translatedQuote(quote));
    expect(explanation).toContain("13");
    expect(explanation).toContain("900,000 ₸");
    expect(explanation).toContain("3,000,000 ₸");
    expect(explanation).toContain("Wedding");
    expect(explanation).toContain("supplied calendar");
    expect(explanation).not.toContain("guaranteed");
  });

  it("labels a missing translation as an original Russian excerpt", () => {
    const unknown = "Новый фрагмент без перевода";
    const card = { ...profile, evidence: [{ code: "description" as const, field: "description", value: unknown, source_quote: unknown }] };
    const explanation = cardExplanation(card, request, "en");
    expect(explanation).toContain("original Russian");
    expect(explanation).toContain(unknown);
  });

  it("uses typed language and duration facts without changing the working-language filter", () => {
    const card: MatchCard = { ...profile, evidence: [
      ...profile.evidence,
      { code: "duration", field: "max_hours", value: 10, source_quote: null },
    ] };
    const explanation = cardExplanation(card, { ...request, language: "казахский", duration_hours: 8 }, "en");
    expect(explanation).toContain("working language: Kazakh");
    expect(explanation).toContain("up to 10 hours");
    expect(explanation).toContain("8-hour request");
  });

  it("describes null attendance duration without an unlimited-hours claim", () => {
    const card: MatchCard = { ...profile, evidence: [{ code: "duration", field: "max_hours", value: null, source_quote: null }] };
    const explanation = cardExplanation(card, { ...request, duration_hours: 12 }, "en");
    expect(explanation).toContain("attendance duration does not apply");
    expect(explanation).not.toContain("unlimited");
  });

  it("keeps original quotes unchanged while translating the displayed explanation", () => {
    const before = structuredClone(profile);
    cardExplanation(profile, request, "en");
    expect(profile).toEqual(before);
    expect(profile.evidence[0].source_quote).toBe(quote);
  });

  it("qualifies availability as a limited snapshot in both languages", () => {
    expect(availabilityLabel("2026-10-11", "en")).toContain("supplied calendar");
    expect(availabilityLabel("2026-10-11", "ru")).toContain("по календарю");
    expect(calendarLabel(metadata, "en")).toContain("23.09.2026–31.12.2026");
    expect(calendarLabel(metadata, "en")).toContain("confirm availability");
  });
});

describe("outcomes and input validation", () => {
  it("describes a budget exclusion without pretending everyone is booked", () => {
    const empty: MatchResponse = { ...result, status: "no_eligible_contractors", cards: [], counts: { city_category_total: 1, eligible_total: 0, returned_total: 0 } };
    expect(resultTitle(empty, "en")).toBe("No one meets the selected conditions");
    expect(resultSummary(empty, "en")).toContain("all selected conditions");
    expect(exclusionSummary(empty, "en")).toContain("over budget — 1");
    expect(exclusionSummary(empty, "en")).not.toContain("booked");
  });

  it("distinguishes an absent category from an excluded existing pool", () => {
    const absent: MatchResponse = { ...result, status: "category_absent", cards: [], counts: { city_category_total: 0, eligible_total: 0, returned_total: 0 } };
    expect(resultSummary(absent, "en")).toContain("no profiles");
    expect(resultSummary(absent, "en")).toContain("Almaty");
    expect(resultTitle(absent, "ru")).toContain("категории нет");
  });

  it("accepts both calendar boundaries and omitted optional constraints", () => {
    expect(invalidFields({ ...request, event_date: metadata.calendar_start }, metadata)).toEqual([]);
    expect(invalidFields({ ...request, event_date: metadata.calendar_end }, metadata)).toEqual([]);
  });

  it("finds invalid date, numeric and canonical-option fields before a request", () => {
    const invalid = { ...request, city: "Almaty", category: "Event host", event_date: "2026-02-30", budget_kzt: 0, duration_hours: -1, language: "English" };
    expect(new Set(invalidFields(invalid, metadata)))
      .toEqual(new Set(["city", "category", "event_date", "budget_kzt", "duration_hours", "language"]));
  });
});
