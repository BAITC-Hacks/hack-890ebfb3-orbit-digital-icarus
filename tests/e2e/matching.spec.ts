import { expect, test, type Locator, type Page } from "@playwright/test";
import type { MatchRequest, MatchResponse } from "../../frontend/src/api/types";

const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const DATASET_HASH = "6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d";
const DENSE: MatchRequest = {
  city: "Алматы", event_date: "2026-10-11", event_format: "свадьба",
  category: "Ведущий", budget_kzt: 3_000_000, duration_hours: null, language: null,
};
const RARE: MatchRequest = {
  ...DENSE, event_date: "2026-10-10", category: "Флорист", budget_kzt: 300_000,
};
const ABSENT: MatchRequest = {
  ...DENSE, city: "Астана", category: "Декоратор", event_date: "2026-10-10",
};
const BOOKED: MatchRequest = {
  ...DENSE, city: "Астана", category: "Флорист", budget_kzt: 300_000,
};
const VENUE: MatchRequest = {
  ...DENSE, city: "Астана", category: "Банкетный зал", event_date: "2026-10-10",
};

const labels: Record<string, RegExp> = {
  city: /^(город|city)/i,
  event_date: /^(дата|event date)/i,
  event_format: /^(формат|тип мероприятия|event format)/i,
  category: /^(категория|category)/i,
  budget_kzt: /^(бюджет|budget)/i,
  duration_hours: /^(длительность|продолжительность|duration)/i,
  language: /^(язык|language)/i,
};

async function field(page: Page, name: keyof typeof labels): Promise<Locator> {
  const labeled = page.getByLabel(labels[name]);
  if (await labeled.count()) return labeled.first();
  // Stable fallbacks are documented for the teammate implementing the UI.
  const identified = page.getByTestId(name);
  if (await identified.count()) return identified.first();
  return page.locator(`[name="${name}"]`).first();
}

function form(page: Page) {
  return page.getByTestId("match-form").or(page.locator("form")).first();
}

function submitButton(page: Page) {
  // The accessible name changes while loading; the submit control stays the same.
  return form(page).locator('button[type="submit"]');
}

async function fillRequest(page: Page, payload: MatchRequest) {
  for (const key of ["city", "event_format", "category"] as const) {
    const control = await field(page, key);
    await expect(control).toBeVisible();
    await control.selectOption(payload[key]);
  }
  await (await field(page, "event_date")).fill(payload.event_date);
  await (await field(page, "budget_kzt")).fill(String(payload.budget_kzt));
  await (await field(page, "duration_hours")).fill(
    payload.duration_hours == null ? "" : String(payload.duration_hours),
  );
  const language = await field(page, "language");
  if (payload.language) await language.selectOption(payload.language);
  else await language.selectOption("");
}

function isMatchResponse(response: { url(): string; request(): { method(): string } }) {
  return new URL(response.url()).pathname === "/api/match"
    && response.request().method() === "POST";
}

async function assertRendered(page: Page, result: MatchResponse) {
  const summary = page.getByTestId("result-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute("data-status", result.status);
  await expect(summary).toHaveAttribute("data-request-date", result.request.event_date);
  await expect(summary).toContainText(result.message);
  const cards = page.getByTestId("contractor-card");
  await expect(cards).toHaveCount(result.cards.length);
  await expect.poll(() => cards.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute("data-contractor-id")),
  )).toEqual(result.cards.map(card => card.id));

  for (const [index, card] of result.cards.entries()) {
    const visible = cards.nth(index);
    await expect(visible).toContainText(card.anon_name);
    await expect(visible).toContainText(card.explanation);
    await expect(visible).toContainText(card.city);
    await expect(visible).toContainText(card.category);
    await expect(visible).toContainText(/от\s|from\s/i);
    await expect(visible).toContainText(card.event_date.split("-").reverse().join("."));
    if (card.synthetic) await expect(visible.getByTestId("synthetic-note")).toBeVisible();
    if (card.price_imputed) await expect(visible.getByTestId("price-imputed-note")).toBeVisible();
    if (card.city_imputed) await expect(visible.getByTestId("city-imputed-note")).toBeVisible();
  }
}

async function submit(page: Page, payload: MatchRequest): Promise<MatchResponse> {
  await fillRequest(page, payload);
  const responsePromise = page.waitForResponse(isMatchResponse);
  const started = performance.now();
  await submitButton(page).click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  const sent = response.request().postDataJSON() as MatchRequest;
  expect(sent).toMatchObject({
    city: payload.city, event_date: payload.event_date, event_format: payload.event_format,
    category: payload.category, budget_kzt: payload.budget_kzt,
  });
  expect(sent.duration_hours ?? null).toBe(payload.duration_hours ?? null);
  expect(sent.language ?? null).toBe(payload.language ?? null);
  const result = await response.json() as MatchResponse;
  expect(result.schema_version).toBe("1");
  expect(result.dataset_version).toBe(DATASET_HASH);
  expect(result.request).toEqual({ ...payload, duration_hours: payload.duration_hours ?? null, language: payload.language ?? null });
  expect(result.cards.length).toBeLessThanOrEqual(3);
  expect(result.counts.returned_total).toBe(result.cards.length);
  expect(new Set(result.cards.map(card => card.id)).size).toBe(result.cards.length);
  expect(Object.values(result.exclusions).reduce((sum, value) => sum + value, 0))
    .toBe(result.counts.city_category_total - result.counts.eligible_total);
  await assertRendered(page, result);
  await expect(submitButton(page)).toBeEnabled();
  await expect(form(page)).toHaveAttribute("aria-busy", "false");
  const renderedMs = performance.now() - started;
  expect(renderedMs, "real browser submit-to-render exceeds the task's 10-second target")
    .toBeLessThan(10_000);
  await test.info().attach(`match-${payload.category}-${payload.event_date}`, {
    body: JSON.stringify({ rendered_ms: renderedMs, response: result }, null, 2),
    contentType: "application/json",
  });
  return result;
}

test.beforeEach(async ({ page, request }) => {
  const health = await request.get(`${API_URL}/api/health`);
  expect(health.ok(), "Start the real backend or set RUN_APP_SERVERS=1").toBeTruthy();
  const metadata = await request.get(`${API_URL}/api/metadata`);
  expect(metadata.ok()).toBeTruthy();
  await page.goto("/#/match");
  await expect(form(page)).toBeVisible();
  await expect(await field(page, "city")).toContainText("Алматы");
  await expect(await field(page, "category")).toContainText("Декоратор");
});

test("dense autumn result preserves server order, repeats exactly and changes with the date", async ({ page }) => {
  const first = await submit(page, DENSE);
  expect(first.counts).toEqual({ city_category_total: 10, eligible_total: 5, returned_total: 3 });
  expect(first.status).toBe("matches_found");
  expect(first.cards.some(card => card.id === "HK-42352")).toBeTruthy();
  const repeat = await submit(page, DENSE);
  expect(repeat).toEqual(first);
  const changed = await submit(page, { ...DENSE, event_date: "2026-10-10" });
  expect(changed.counts).toEqual({ city_category_total: 10, eligible_total: 3, returned_total: 3 });
  expect(new Set(changed.cards.map(card => card.id)))
    .toEqual(new Set(["HK-77838", "HK-72938", "HK-27222"]));
  expect(changed.cards.map(card => card.id)).not.toEqual(first.cards.map(card => card.id));
  expect(changed.cards.map(card => card.id)).not.toContain("HK-42352");
  expect(changed.cards.map(card => card.id)).not.toContain("HK-44923");
  const hiddenNames = first.cards.map(card => card.explanation.replaceAll(card.anon_name, ""));
  expect(new Set(hiddenNames).size).toBe(first.cards.length);
});

test("rare category returns the sole eligible florist and displays its imputed-price note", async ({ page }) => {
  const result = await submit(page, RARE);
  expect(result.status).toBe("matches_found");
  expect(result.counts).toEqual({ city_category_total: 2, eligible_total: 1, returned_total: 1 });
  expect(result.exclusions.booked).toBe(1);
  expect(result.cards.map(card => card.id)).toEqual(["HK-39372"]);
  expect(result.cards[0].price_imputed).toBeTruthy();
});

test("absent category and an entirely booked category have distinct visible outcomes", async ({ page }) => {
  const absent = await submit(page, ABSENT);
  expect(absent.status).toBe("category_absent");
  expect(absent.counts).toEqual({ city_category_total: 0, eligible_total: 0, returned_total: 0 });
  const booked = await submit(page, BOOKED);
  expect(booked.status).toBe("no_eligible_contractors");
  expect(booked.counts).toEqual({ city_category_total: 1, eligible_total: 0, returned_total: 0 });
  expect(booked.exclusions.booked).toBe(1);
  expect(booked.message).not.toBe(absent.message);
});

test("venues use the same calendar and optional language/duration constraints", async ({ page }) => {
  const available = await submit(page, { ...VENUE, language: "английский", duration_hours: 10 });
  expect(available.cards.map(card => card.id)).toEqual(["HK-90012"]);
  expect(available.cards[0].synthetic).toBeTruthy();
  const tooLong = await submit(page, { ...VENUE, language: "английский", duration_hours: 11 });
  expect(tooLong.status).toBe("no_eligible_contractors");
  expect(tooLong.exclusions.duration_exceeded).toBe(1);
  const wrongLanguage = await submit(page, { ...VENUE, language: "казахский" });
  expect(wrongLanguage.status).toBe("no_eligible_contractors");
  expect(wrongLanguage.exclusions.unsupported_language).toBe(1);
  const busy = await submit(page, { ...VENUE, event_date: "2026-10-11" });
  expect(busy.status).toBe("no_eligible_contractors");
  expect(busy.exclusions.booked).toBe(1);
});

test("null duration limits stay eligible and a seasonal shortage stays a short result", async ({ page }) => {
  const florist = await submit(page, { ...RARE, duration_hours: 12, language: "русский" });
  expect(florist.cards.map(card => card.id)).toEqual(["HK-39372"]);
  const december = await submit(page, { ...DENSE, event_date: "2026-12-26" });
  expect(december.counts.returned_total).toBe(1);
  expect(december.cards.map(card => card.id)).toEqual(["HK-44923"]);
});

test("a failed request remains an error and preserves the form for a real retry", async ({ page }) => {
  await page.route("**/api/match", route => route.abort("failed"));
  await fillRequest(page, RARE);
  await submitButton(page).click();
  await expect(page.getByTestId("request-error").or(page.getByRole("alert")).first()).toBeVisible();
  await expect(await field(page, "event_date")).toHaveValue(RARE.event_date);
  await expect(await field(page, "budget_kzt")).toHaveValue(String(RARE.budget_kzt));
  await expect(page.getByTestId("contractor-card")).toHaveCount(0);
  await expect(page.locator('[data-testid="result-summary"][data-status="no_eligible_contractors"]')).toHaveCount(0);
  await expect(submitButton(page)).toBeEnabled();
  await page.unroute("**/api/match");
  const retry = await submit(page, RARE);
  expect(retry.cards.map(card => card.id)).toEqual(["HK-39372"]);
});

test("in-flight protection prevents an older date from replacing the newer result", async ({ page }) => {
  let releaseOld!: () => void;
  const held = new Promise<void>(resolve => { releaseOld = resolve; });
  let markOldReady!: () => void;
  const oldReady = new Promise<void>(resolve => { markOldReady = resolve; });
  let markOldFinished!: () => void;
  const oldFinished = new Promise<void>(resolve => { markOldFinished = resolve; });
  let first = true;
  await page.route("**/api/match", async route => {
    if (!first) return route.continue();
    first = false;
    // The held response comes from the real API; only delivery timing is modified.
    const realResponse = await route.fetch();
    markOldReady();
    await held;
    try {
      await route.fulfill({ response: realResponse });
    } catch (error) {
      // An AbortController may cancel the superseded request before fulfillment.
      if (!/abort|cancel|closed|invalid interception/i.test(String(error))) throw error;
    } finally {
      markOldFinished();
    }
  });

  await fillRequest(page, DENSE);
  await submitButton(page).click();
  await oldReady;
  await expect(form(page)).toHaveAttribute("aria-busy", "true");
  const newer = { ...DENSE, event_date: "2026-10-10" };
  try {
    // Editing stays available during a search and must invalidate that search.
    // Keep the old response held until the newer result is already displayed.
    await expect(await field(page, "event_date")).toBeEnabled();
    await (await field(page, "event_date")).fill(newer.event_date);
    await expect(submitButton(page)).toBeEnabled();
    const current = await submit(page, newer);
    expect(current.request.event_date).toBe("2026-10-10");
    releaseOld();
    await oldFinished;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await assertRendered(page, current);
  } finally {
    releaseOld();
    await page.unroute("**/api/match");
  }
});

test("the real form and result remain usable at a 375px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await submit(page, RARE);
  await expect(submitButton(page)).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth, viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.screenshot({ path: test.info().outputPath("rare-florist-mobile.png"), fullPage: true });
});
