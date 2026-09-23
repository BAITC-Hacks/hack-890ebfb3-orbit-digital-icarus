import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import type { MatchAlternative, MatchResponse, NormalizedMatchRequest } from "../../frontend/src/api/types";

// Every response here comes from the running production API and pinned CSV.
// No interception, route fulfillment, preview fixtures or provider calls.
const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const DATASET_HASH = "6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d";
const restaurant: NormalizedMatchRequest = {
  city: "Астана", category: "Ресторан", event_format: "свадьба", event_date: "2026-10-31",
  budget_kzt: 4_000_000, duration_hours: null, language: null,
};
const bookedFlorist: NormalizedMatchRequest = {
  city: "Астана", category: "Флорист", event_format: "свадьба", event_date: "2026-10-11",
  budget_kzt: 300_000, duration_hours: null, language: null,
};
const overBudgetFlorist: NormalizedMatchRequest = {
  ...bookedFlorist, city: "Алматы", event_date: "2026-10-10", budget_kzt: 100_000,
};

function isMatch(response: Response) {
  return new URL(response.url()).pathname === "/api/match" && response.request().method() === "POST";
}

async function fillRequest(page: Page, request: NormalizedMatchRequest) {
  for (const field of ["city", "category", "event_format"] as const) {
    await page.locator(`select[name="${field}"]`).selectOption(request[field]);
  }
  await page.locator('input[name="event_date"]').fill(request.event_date);
  await page.locator('input[name="budget_kzt"]').fill(String(request.budget_kzt));
  await page.locator('input[name="duration_hours"]').fill(request.duration_hours == null ? "" : String(request.duration_hours));
  await page.locator('select[name="language"]').selectOption(request.language ?? "");
}

async function assertInputs(page: Page, request: NormalizedMatchRequest) {
  for (const field of ["city", "category", "event_format"] as const) {
    await expect(page.locator(`select[name="${field}"]`)).toHaveValue(request[field]);
  }
  await expect(page.locator('input[name="event_date"]')).toHaveValue(request.event_date);
  await expect(page.locator('input[name="budget_kzt"]')).toHaveValue(String(request.budget_kzt));
  await expect(page.locator('input[name="duration_hours"]')).toHaveValue(request.duration_hours == null ? "" : String(request.duration_hours));
  await expect(page.locator('select[name="language"]')).toHaveValue(request.language ?? "");
}

async function clickAndRead(page: Page, control: Locator, expected: NormalizedMatchRequest): Promise<MatchResponse> {
  const pending = page.waitForResponse(isMatch);
  await control.click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  const sent = response.request().postDataJSON() as NormalizedMatchRequest;
  expect(sent).toEqual(expected);
  const result = await response.json() as MatchResponse;
  expect(result.request).toEqual(expected);
  expect(result.dataset_version).toBe(DATASET_HASH);
  expect(result.schema_version).toBe("1");
  expect(result.counts.returned_total).toBe(result.cards.length);
  const summary = page.getByTestId("result-summary");
  await expect(summary).toHaveAttribute("data-status", result.status);
  await expect(summary).toHaveAttribute("data-request-date", expected.event_date);
  const cards = page.getByTestId("contractor-card");
  await expect(cards).toHaveCount(result.cards.length);
  await expect.poll(() => cards.evaluateAll(elements => elements.map(element => element.getAttribute("data-contractor-id"))))
    .toEqual(result.cards.map(card => card.id));
  await test.info().attach(`recovery-${expected.city}-${expected.event_date}-${expected.budget_kzt}`, {
    body: JSON.stringify({ sent, response: result }, null, 2), contentType: "application/json",
  });
  return result;
}

function assertSuggestedChange(result: MatchResponse, field: MatchAlternative["changed_field"], expected: NormalizedMatchRequest) {
  const alternative = result.alternatives?.find(item => item.changed_field === field && item.request[field] === expected[field]);
  expect(alternative, `Expected a verified ${field} alternative`).toBeDefined();
  expect(alternative?.request).toEqual(expected);
  expect(alternative?.eligible_total).toBe(1);
  const changed = (Object.keys(expected) as Array<keyof NormalizedMatchRequest>)
    .filter(key => result.request[key] !== expected[key]);
  expect(changed).toEqual([field]);
}

function alternativeButton(page: Page, field: MatchAlternative["changed_field"]) {
  return page.getByTestId("match-alternative").and(page.locator(`[data-changed-field="${field}"]`));
}

test.beforeEach(async ({ page, request }) => {
  const health = await request.get(`${API_URL}/api/health`);
  expect(health.ok(), "Start the real backend or use RUN_APP_SERVERS=1").toBeTruthy();
  expect((await health.json()).dataset_version).toBe(DATASET_HASH);
  await page.goto("/#/match");
  await expect(page.getByTestId("match-form").locator('button[type="submit"]')).toBeEnabled();
});

test("the screenshot's absent Astana restaurant can explicitly recover by changing only city", async ({ page }) => {
  const requests: NormalizedMatchRequest[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/match" && request.method() === "POST") {
      requests.push(request.postDataJSON() as NormalizedMatchRequest);
    }
  });
  await fillRequest(page, restaurant);
  const empty = await clickAndRead(page, page.getByTestId("match-form").locator('button[type="submit"]'), restaurant);
  expect(empty.status).toBe("category_absent");
  expect(empty.counts).toEqual({ city_category_total: 0, eligible_total: 0, returned_total: 0 });
  await expect(page.getByTestId("contractor-card")).toHaveCount(0);
  const changed = { ...restaurant, city: "Алматы" };
  assertSuggestedChange(empty, "city", changed);
  await expect(page.getByTestId("match-alternatives")).toBeVisible();
  const city = alternativeButton(page, "city").filter({ hasText: "Алматы" });
  await expect(city).toHaveCount(1);
  await expect(city).toContainText("Подходящих профилей: 1");
  await assertInputs(page, restaurant);
  expect(requests).toEqual([restaurant]);

  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const englishCity = alternativeButton(page, "city").filter({ hasText: "Almaty" });
  await expect(englishCity).toContainText("1 eligible profiles");
  await expect(page.getByTestId("result-summary")).toHaveAttribute("data-status", "category_absent");
  await assertInputs(page, restaurant);
  expect(requests).toEqual([restaurant]);

  const result = await clickAndRead(page, englishCity, changed);
  expect(result.status).toBe("matches_found");
  expect(result.counts.eligible_total).toBe(1);
  expect(result.cards).toHaveLength(1);
  expect(result.cards[0].city).toBe("Алматы");
  expect(result.cards[0].category).toBe("Ресторан");
  await assertInputs(page, changed);
  await expect(page.locator(".query-tags .query-tag")).toHaveText([
    "Restaurant", "Almaty", "Wedding", "31.10.2026", "up to 4,000,000 ₸",
  ]);
  expect(requests).toEqual([restaurant, changed]);
});

test("a booked Astana florist recovers on the verified earlier date without changing other constraints", async ({ page }) => {
  await fillRequest(page, bookedFlorist);
  const empty = await clickAndRead(page, page.getByTestId("match-form").locator('button[type="submit"]'), bookedFlorist);
  expect(empty.status).toBe("no_eligible_contractors");
  expect(empty.exclusions.booked).toBe(1);
  expect(empty.cards).toHaveLength(0);
  const changed = { ...bookedFlorist, event_date: "2026-10-10" };
  assertSuggestedChange(empty, "event_date", changed);
  const earlier = alternativeButton(page, "event_date").filter({ hasText: "10.10.2026" });
  await expect(earlier).toContainText("Подходящих профилей: 1");
  await assertInputs(page, bookedFlorist);
  const result = await clickAndRead(page, earlier, changed);
  expect(result.status).toBe("matches_found");
  expect(result.cards.map(card => card.id)).toEqual(["HK-90002"]);
  expect(result.counts.eligible_total).toBe(1);
  await assertInputs(page, changed);
  await expect(page.locator(".query-tags")).toContainText("10.10.2026");
  await expect(page.locator(".query-tags")).not.toContainText("11.10.2026");
});

test("a low-budget Almaty florist recovers only after the user chooses the verified 200000 KZT budget", async ({ page }) => {
  await fillRequest(page, overBudgetFlorist);
  const empty = await clickAndRead(page, page.getByTestId("match-form").locator('button[type="submit"]'), overBudgetFlorist);
  expect(empty.status).toBe("no_eligible_contractors");
  expect(empty.exclusions.over_budget).toBeGreaterThan(0);
  expect(empty.cards).toHaveLength(0);
  const changed = { ...overBudgetFlorist, budget_kzt: 200_000 };
  assertSuggestedChange(empty, "budget_kzt", changed);
  const budget = alternativeButton(page, "budget_kzt");
  await expect(budget).toHaveCount(1);
  await expect(budget).toContainText(/200\s*000\s*₸/);
  await expect(budget).toContainText("Подходящих профилей: 1");
  await assertInputs(page, overBudgetFlorist);
  const result = await clickAndRead(page, budget, changed);
  expect(result.status).toBe("matches_found");
  expect(result.cards.map(card => card.id)).toEqual(["HK-39372"]);
  expect(result.counts.eligible_total).toBe(1);
  await assertInputs(page, changed);
  await expect(page.locator(".query-tags")).toContainText(/до 200\s*000\s*₸/);
  await expect(page.locator(".query-tags")).toContainText("10.10.2026");
});
