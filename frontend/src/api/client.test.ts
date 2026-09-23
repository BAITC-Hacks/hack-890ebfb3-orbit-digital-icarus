import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ApiResponseError,
  getHealth,
  getMetadata,
  matchContractors,
  type MatchCard,
  type MatchRequest,
  type MatchResponse,
} from "./client";

const request: MatchRequest = {
  city: "Алматы",
  event_date: "2026-10-10",
  event_format: "свадьба",
  category: "Флорист",
  budget_kzt: 300000,
};

function card(id: string): MatchCard {
  return {
    id,
    anon_name: `Профиль ${id}`,
    category: "Флорист",
    categories: ["Флорист"],
    city: "Алматы",
    price_from_kzt: 200000,
    event_date: "2026-10-10",
    availability: "free_in_dataset",
    synthetic: true,
    source_kind: "provided",
    city_imputed: false,
    price_imputed: false,
    explanation: "Работает со свадьбами; стартовая цена укладывается в бюджет.",
    evidence: [
      { code: "format", field: "event_formats", value: "свадьба", source_quote: null },
    ],
  };
}

function result(cards: MatchCard[] = []): MatchResponse {
  return {
    schema_version: "1",
    status: cards.length ? "matches_found" : "no_eligible_contractors",
    request: { ...request, duration_hours: null, language: null },
    dataset_version: "test-data",
    algorithm_version: "test-rules",
    message: cards.length ? "Подрядчики найдены." : "Подрядчики заняты.",
    counts: { city_category_total: 3, eligible_total: cards.length, returned_total: cards.length },
    exclusions: {
      booked: 3 - cards.length,
      over_budget: 0,
      unsupported_format: 0,
      unsupported_language: 0,
      duration_exceeded: 0,
    },
    cards,
  };
}

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("matchContractors", () => {
  it("sends canonical keys and explicit null optionals without changing the caller's values", async () => {
    const fetchMock = respond(result());
    const snapshot = { ...request };
    await matchContractors(request);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/match", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      signal: undefined,
      body: JSON.stringify({ ...request, duration_hours: null, language: null }),
    });
    expect(request).toEqual(snapshot);
  });

  it("keeps optional constraints and uses an explicit API origin", async () => {
    const fetchMock = respond(result());
    await matchContractors({ ...request, duration_hours: 4, language: "Русский" }, {
      baseUrl: "http://localhost:8000/",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/match");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      duration_hours: 4,
      language: "Русский",
    });
  });

  it("preserves the complete response and server ranking order", async () => {
    const expected = result([card("HK-3"), card("HK-1"), card("HK-2")]);
    respond(expected);
    const actual = await matchContractors(request);
    expect(actual).toEqual(expected);
    expect(actual.cards.map((item) => item.id)).toEqual(["HK-3", "HK-1", "HK-2"]);
  });

  it.each(["category_absent", "no_eligible_contractors"] as const)(
    "preserves HTTP 200 business outcome %s",
    async (status) => {
      const expected = result();
      expected.status = status;
      if (status === "category_absent") {
        expected.counts.city_category_total = 0;
        expected.exclusions.booked = 0;
      }
      respond(expected);
      await expect(matchContractors(request)).resolves.toEqual(expected);
    },
  );

  it("maps FastAPI 422 details to field errors without losing structured details", async () => {
    const detail = [
      { loc: ["body", "budget_kzt"], msg: "Input should be greater than 0", type: "greater_than" },
      { loc: ["body", "event_date"], msg: "Date is outside the supported window", type: "value_error" },
      { loc: ["body"], msg: "Invalid request", type: "value_error" },
    ];
    respond({ detail }, 422);
    const failure = await matchContractors(request).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 422,
      detail,
      fieldErrors: {
        budget_kzt: ["Input should be greater than 0"],
        event_date: ["Date is outside the supported window"],
      },
      validationErrors: [
        { field: "budget_kzt", message: detail[0].msg, type: "greater_than" },
        { field: "event_date", message: detail[1].msg, type: "value_error" },
        { field: null, message: "Invalid request", type: "value_error" },
      ],
    });
  });

  it("keeps a JSON error detail available without showing server details as the message", async () => {
    respond({ detail: "internal stack trace" }, 500);
    const failure = await matchContractors(request).catch((error: unknown) => error);
    expect(failure).toMatchObject({ name: "ApiError", status: 500, detail: "internal stack trace" });
    expect((failure as ApiError).message).not.toContain("internal stack trace");
  });

  it("handles non-JSON proxy errors as HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));
    const failure = await matchContractors(request).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 502, fieldErrors: {} });
    expect((failure as ApiError).message).not.toContain("<html>");
  });

  it.each(["not JSON", "null", "[]"])("rejects an invalid successful body: %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    await expect(matchContractors(request)).rejects.toBeInstanceOf(ApiResponseError);
  });

  it.each([
    ["empty object", {}],
    ["error object returned with HTTP 200", { detail: "upstream error" }],
    ["unknown outcome", { ...result(), status: "not_found" }],
    ["array masquerading as outcome", { ...result(), status: ["no_eligible_contractors"] }],
    ["missing normalized request", { ...result(), request: undefined }],
    ["missing exclusions", { ...result(), exclusions: undefined }],
    ["wrong count type", { ...result(), counts: { city_category_total: "3", eligible_total: 0, returned_total: 0 } }],
    ["empty success", { ...result(), status: "matches_found" }],
    ["cards inside an empty outcome", { ...result([card("HK-1")]), status: "no_eligible_contractors" }],
    ["more than three cards", result([card("HK-1"), card("HK-2"), card("HK-3"), card("HK-4")])],
    ["duplicate IDs", result([card("HK-1"), card("HK-1")])],
    ["missing explanation", result([{ ...card("HK-1"), explanation: undefined } as unknown as MatchCard])],
    ["invalid provenance", result([{ ...card("HK-1"), source_kind: "verified" } as unknown as MatchCard])],
    ["invalid evidence", result([{ ...card("HK-1"), evidence: [{}] } as unknown as MatchCard])],
  ])("rejects malformed HTTP 200 match response: %s", async (_label, response) => {
    respond(response);
    await expect(matchContractors(request)).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("accepts and preserves harmless extra response fields", async () => {
    const expected = {
      ...result([{ ...card("HK-1"), future_card_field: true } as MatchCard]),
      future_response_field: "additional information",
    };
    respond(expected);
    await expect(matchContractors(request)).resolves.toEqual(expected);
  });

  it("propagates a network failure rather than returning an empty shortlist", async () => {
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    await expect(matchContractors(request)).rejects.toBe(failure);
  });

  it("passes AbortSignal through and preserves AbortError", async () => {
    const controller = new AbortController();
    const failure = new DOMException("The operation was aborted", "AbortError");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(failure), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = matchContractors(request, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBe(failure);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe("GET endpoints", () => {
  it.each([
    ["metadata", getMetadata],
    ["health", getHealth],
  ] as const)("rejects a malformed HTTP 200 %s object", async (_name, endpoint) => {
    respond({});
    await expect(endpoint()).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("loads metadata from the requested origin with cancellation support", async () => {
    const metadata = {
      cities: ["Алматы"], categories: ["Флорист"], event_formats: ["свадьба"], languages: ["Русский"],
      date_min: "2026-09-23", date_max: "2026-12-31",
    };
    const fetchMock = respond(metadata);
    const controller = new AbortController();
    await expect(getMetadata({ baseUrl: "http://localhost:8000", signal: controller.signal })).resolves.toEqual(metadata);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/metadata", {
      method: "GET", headers: { Accept: "application/json" }, signal: controller.signal,
    });
  });

  it("loads same-origin health and preserves catalog versions", async () => {
    const health = { status: "ok", profile_count: 66, dataset_version: "hash", algorithm_version: "v1" };
    const fetchMock = respond(health);
    await expect(getHealth()).resolves.toEqual(health);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", {
      method: "GET", headers: { Accept: "application/json" }, signal: undefined,
    });
  });
});
