import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ApiResponseError,
  getHealth,
  getMetadata,
  matchContractors,
  type MatchCard,
  type MatchAlternative,
  type EvidenceItem,
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

function alternative(changed_field: MatchAlternative["changed_field"] = "city"): MatchAlternative {
  return {
    changed_field,
    request: {
      ...request, duration_hours: null, language: null,
      ...({ city: { city: "Астана" }, event_date: { event_date: "2026-10-11" }, budget_kzt: { budget_kzt: 400000 } }[changed_field]),
    },
    eligible_total: 1,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
      signal: expect.any(AbortSignal),
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
    ["zero starting price", result([{ ...card("HK-1"), price_from_kzt: 0 }])],
    ["card in another city", result([{ ...card("HK-1"), city: "Астана" }])],
    ["card for another date", result([{ ...card("HK-1"), event_date: "2026-10-11" }])],
    ["card with another selected category", result([{ ...card("HK-1"), category: "Ведущий" }])],
    ["card missing the selected category", result([{ ...card("HK-1"), categories: ["Ведущий"] }])],
    ["card exceeding the budget", result([{ ...card("HK-1"), price_from_kzt: 300001 }])],
    ["unreconciled exclusions", { ...result([card("HK-1")]), exclusions: { ...result().exclusions, booked: 1 } }],
    ["fewer cards than eligible profiles below the cap", {
      ...result([card("HK-1")]),
      counts: { city_category_total: 3, eligible_total: 2, returned_total: 1 },
      exclusions: { ...result().exclusions, booked: 1 },
    }],
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

  it("accepts a full three-card shortlist when more profiles are eligible", async () => {
    const expected = {
      ...result([card("HK-1"), card("HK-2"), card("HK-3")]),
      counts: { city_category_total: 6, eligible_total: 4, returned_total: 3 },
      exclusions: { ...result().exclusions, booked: 2 },
    };
    respond(expected);
    await expect(matchContractors(request)).resolves.toEqual(expected);
  });

  it("checks the normalized response without rejecting legal input aliases", async () => {
    const expected = result([card("HK-1")]);
    respond(expected);
    await expect(matchContractors({ ...request, city: " алматы ", category: "флорист" }))
      .resolves.toEqual(expected);
  });

  it.each(["русский", 200000, 2.5, ["русский", "казахский"], null].map(value => ({ value })))(
    "accepts a contract-supported evidence value: %j",
    async ({ value }) => {
      const expected = result([{
        ...card("HK-1"),
        evidence: [{ code: "duration", field: "max_hours", value, source_quote: null }],
      }]);
      respond(expected);
      await expect(matchContractors(request)).resolves.toEqual(expected);
    },
  );

  it.each([true, false, [1, 2], ["русский", 2], [null], { fact: "unsupported" }].map(value => ({ value })))(
    "rejects evidence outside string, number, string array or null: %j",
    async ({ value }) => {
      const unsupported = { code: "duration", field: "max_hours", value, source_quote: null };
      respond(result([{ ...card("HK-1"), evidence: [unsupported as unknown as EvidenceItem] }]));
      await expect(matchContractors(request)).rejects.toBeInstanceOf(ApiResponseError);
    },
  );

  it("propagates a network failure rather than returning an empty shortlist", async () => {
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    await expect(matchContractors(request)).rejects.toBe(failure);
  });

  it("forwards caller cancellation and preserves its AbortError", async () => {
    const controller = new AbortController();
    const failure = new DOMException("The operation was aborted", "AbortError");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(failure), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = matchContractors(request, { signal: controller.signal });
    controller.abort(failure);
    await expect(pending).rejects.toBe(failure);
    const transportSignal = fetchMock.mock.calls[0][1]?.signal;
    expect(transportSignal?.aborted).toBe(true);
    expect(transportSignal?.reason).toBe(failure);
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
      calendar_start: "2026-09-23", calendar_end: "2026-12-31",
    };
    const fetchMock = respond(metadata);
    const controller = new AbortController();
    await expect(getMetadata({ baseUrl: "http://localhost:8000", signal: controller.signal })).resolves.toEqual(metadata);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/metadata", {
      method: "GET", headers: { Accept: "application/json" }, signal: expect.any(AbortSignal),
    });
  });

  it("loads same-origin health and preserves catalog versions", async () => {
    const health = { status: "ready", profile_count: 66, dataset_version: "hash", algorithm_version: "v1" };
    const fetchMock = respond(health);
    await expect(getHealth()).resolves.toEqual(health);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", {
      method: "GET", headers: { Accept: "application/json" }, signal: expect.any(AbortSignal),
    });
  });

  it("rejects the superseded provisional metadata field names", async () => {
    respond({
      cities: ["Алматы"], categories: ["Флорист"], event_formats: ["свадьба"], languages: ["русский"],
      date_min: "2026-09-23", date_max: "2026-12-31",
    });
    await expect(getMetadata()).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("rejects the superseded provisional health status", async () => {
    respond({ status: "ok", profile_count: 66, dataset_version: "hash", algorithm_version: "v1" });
    await expect(getHealth()).rejects.toBeInstanceOf(ApiResponseError);
  });
});

describe("verified empty-result alternatives", () => {
  it.each(["category_absent", "no_eligible_contractors"] as const)("preserves up to three one-field alternatives for %s", async (status) => {
    const expected = {
      ...result(), status,
      alternatives: [alternative("city"), alternative("event_date"), alternative("budget_kzt")],
    };
    if (status === "category_absent") {
      expected.counts.city_category_total = 0;
      expected.exclusions.booked = 0;
    }
    respond(expected);
    await expect(matchContractors(request)).resolves.toEqual(expected);
  });

  it("accepts the backend's empty alternatives list on a successful result", async () => {
    const expected = { ...result([card("HK-1")]), alternatives: [] };
    respond(expected);
    await expect(matchContractors(request)).resolves.toEqual(expected);
  });

  it.each([
    ["null list", null],
    ["object instead of list", {}],
    ["more than three suggestions", [alternative(), alternative(), alternative(), alternative()]],
    ["invalid suggestion", [null]],
    ["unsupported changed field", [{ ...alternative(), changed_field: "language" }]],
    ["non-string changed field", [{ ...alternative(), changed_field: ["city"] }]],
    ["field does not describe the change", [{ ...alternative(), changed_field: "event_date" }]],
    ["no changed constraint", [{ ...alternative(), request: result().request }]],
    ["two changed constraints", [{ ...alternative(), request: { ...alternative().request, event_date: "2026-10-11" } }]],
    ["changed optional language", [{ ...alternative(), request: { ...alternative().request, language: "казахский" } }]],
    ["changed optional duration", [{ ...alternative(), request: { ...alternative().request, duration_hours: 4 } }]],
    ["missing normalized optional", [{ ...alternative(), request: { ...alternative().request, duration_hours: undefined } }]],
    ["missing required field", [{ ...alternative(), request: { ...alternative().request, category: undefined } }]],
    ["impossible alternative date", [{ ...alternative("event_date"), request: { ...result().request, event_date: "2026-02-30" } }]],
    ["lower budget", [{ ...alternative("budget_kzt"), request: { ...result().request, budget_kzt: 200000 } }]],
    ["zero eligible count", [{ ...alternative(), eligible_total: 0 }]],
    ["fractional eligible count", [{ ...alternative(), eligible_total: 1.5 }]],
    ["string eligible count", [{ ...alternative(), eligible_total: "1" }]],
  ])("rejects %s", async (_name, alternatives) => {
    respond({ ...result(), alternatives });
    await expect(matchContractors(request)).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("rejects suggestions attached to a successful shortlist", async () => {
    respond({ ...result([card("HK-1")]), alternatives: [alternative()] });
    await expect(matchContractors(request)).rejects.toBeInstanceOf(ApiResponseError);
  });
});

describe("request deadlines and cancellation cleanup", () => {
  it.each([
    ["GET metadata", () => getMetadata({ timeoutMs: 20 })],
    ["POST matching", () => matchContractors(request, { timeoutMs: 20 })],
  ] as const)("bounds a hanging %s fetch even when it ignores abort", async (_name, endpoint) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const pending = endpoint().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20);
    const failure = await pending;
    expect(failure).toMatchObject({ name: "TimeoutError", message: "The request timed out after 20 ms." });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock.mock.calls[0][1]?.signal?.reason).toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a ten-second default deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const pending = getMetadata().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ name: "TimeoutError", message: "The request timed out after 10000 ms." });
  });

  it("keeps one deadline across headers and a hanging response body", async () => {
    vi.useFakeTimers();
    const response = new Response("unused", { status: 200 });
    vi.spyOn(response, "text").mockImplementation(() => new Promise(() => {}));
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve(response), 6);
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = getMetadata({ timeoutMs: 10 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(6);
    expect(response.text).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(4);
    expect(await pending).toMatchObject({ name: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles caller cancellation even when a hanging transport ignores it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})));
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const pending = getMetadata({ signal: controller.signal }).catch((error: unknown) => error);
    controller.abort();
    expect(await pending).toBe(controller.signal.reason);
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves caller abort while waiting for a response body", async () => {
    vi.useFakeTimers();
    const response = new Response("unused", { status: 200 });
    vi.spyOn(response, "text").mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
    const controller = new AbortController();
    const pending = getMetadata({ signal: controller.signal }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(response.text).toHaveBeenCalledOnce();
    controller.abort();
    expect(await pending).toBe(controller.signal.reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not send a request when the caller signal is already aborted", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(getMetadata({ signal: controller.signal })).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "HTTP error", "network error"] as const)("cleans up its timer and caller listener after %s", async (outcome) => {
    vi.useFakeTimers();
    const fetchMock = outcome === "success" ? respond(result())
      : outcome === "HTTP error" ? respond({ detail: "unavailable" }, 503)
        : vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    await matchContractors(request, { signal: controller.signal }).catch(() => {});
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])("rejects an invalid deadline %s", async (timeoutMs) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMetadata({ timeoutMs })).rejects.toBeInstanceOf(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("published backend response fixtures", () => {
  it.each(["matches_found", "category_absent", "no_eligible_contractors"])(
    "accepts and preserves contracts/examples/%s.json",
    async (outcome) => {
      const fixture = JSON.parse(readFileSync(
        new URL(`../../../contracts/examples/${outcome}.json`, import.meta.url), "utf8",
      )) as MatchResponse;
      expect(fixture.status).toBe(outcome);
      respond(fixture);
      await expect(matchContractors(fixture.request)).resolves.toEqual(fixture);
    },
  );
});
