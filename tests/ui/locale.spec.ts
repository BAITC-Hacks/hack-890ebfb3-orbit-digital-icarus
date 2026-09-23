import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { MatchRequest, MatchResponse, MetadataResponse } from "../../frontend/src/api/types";

// These checks intentionally mock HTTP. Real matching belongs to tests/e2e.
const fixture = (name: string): MatchResponse => JSON.parse(
  readFileSync(resolve("contracts", "examples", `${name}.json`), "utf8"),
);
const rare = fixture("matches_found");
const absent = fixture("category_absent");
const unavailable = fixture("no_eligible_contractors");
const quote = "Мы специализируемся на авторском цветочном оформлении и флористике для мероприятий в Алматы";
const englishEvidence: Record<string, string> = JSON.parse(
  readFileSync(resolve("frontend/src/i18n/evidence.en.json"), "utf8"),
);

// B1 metadata field names and canonical values; no Python process is required.
const metadata: MetadataResponse = {
  cities: ["Алматы", "Астана", "Зарубежье"],
  categories: ["Ведущий", "Флорист", "Декоратор", "Фото и видеобудки", "Банкетный зал"],
  event_formats: ["свадьба", "корпоратив", "той"],
  languages: ["русский", "казахский", "английский"],
  calendar_start: "2026-09-23",
  calendar_end: "2026-12-31",
};

type MockReply = { status?: number; body: unknown };
type ReplyFactory = (request: MatchRequest, index: number) => MockReply;

async function mockApi(page: Page, reply: ReplyFactory = () => ({ body: rare })) {
  const requests: MatchRequest[] = [];
  let metadataRequests = 0;
  await page.route("**/api/metadata", async (route) => {
    metadataRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(metadata) });
  });
  await page.route("**/api/match", async (route) => {
    const request = route.request().postDataJSON() as MatchRequest;
    requests.push(request);
    const response = reply(request, requests.length - 1);
    await route.fulfill({ status: response.status ?? 200, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Подобрать подрядчика", exact: true })).toBeEnabled();
  return { requests, metadataRequests: () => metadataRequests };
}

async function english(page: Page) {
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function fillRare(page: Page) {
  await page.locator('select[name="city"]').selectOption("Алматы");
  await page.locator('select[name="category"]').selectOption("Флорист");
  await page.locator('select[name="event_format"]').selectOption("свадьба");
  await page.locator('input[name="event_date"]').fill("2026-10-10");
  await page.locator('input[name="budget_kzt"]').fill("300000");
}

function withGroundedExcerpt(request: MatchRequest): MatchResponse {
  return {
    ...rare,
    request: { ...request, duration_hours: request.duration_hours ?? null, language: request.language ?? null },
    cards: rare.cards.map((card) => ({
      ...card,
      evidence: [...card.evidence, { code: "description", field: "description", value: quote, source_quote: quote }],
    })),
  };
}

async function cardIds(page: Page) {
  return page.getByTestId("contractor-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-contractor-id")));
}

test("Russian is the default; English labels, document language and preference survive reload", async ({ page }) => {
  const api = await mockApi(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("combobox", { name: "Город", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Русский", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('input[name="event_date"]')).toHaveAttribute("min", metadata.calendar_start);
  await expect(page.locator('input[name="event_date"]')).toHaveAttribute("max", metadata.calendar_end);

  await english(page);
  await expect(page.getByRole("combobox", { name: "City", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Event format", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Contractor category", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find contractors", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("combobox", { name: "City", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find contractors", exact: true })).toBeEnabled();
  expect(api.requests).toHaveLength(0);
});

test("English form labels still submit Russian canonical request values", async ({ page }) => {
  const api = await mockApi(page, (request) => ({ body: withGroundedExcerpt(request) }));
  await english(page);
  await page.getByRole("combobox", { name: "City", exact: true }).selectOption({ label: "Almaty" });
  await page.getByRole("combobox", { name: "Contractor category", exact: true }).selectOption({ label: "Florist" });
  await page.getByRole("combobox", { name: "Event format", exact: true }).selectOption({ label: "Wedding" });
  await page.getByRole("combobox", { name: /Contractor's working language/ }).selectOption({ label: "Russian" });
  await page.getByLabel("Event date", { exact: true }).fill("2026-10-10");
  await page.getByLabel("Budget, ₸", { exact: true }).fill("300000");
  await page.getByLabel(/Duration, hours/).fill("4");
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(1);
  expect(api.requests).toEqual([{
    city: "Алматы", event_date: "2026-10-10", event_format: "свадьба", category: "Флорист",
    budget_kzt: 300000, duration_hours: 4, language: "русский",
  }]);
  await expect(page.locator('select[name="language"]')).toHaveValue("русский");
});

test("changing locale after results preserves server order and working-language filter without refetch", async ({ page }) => {
  // Explicit synthetic UI-only variation tests server ordering, not eligibility.
  const api = await mockApi(page, (request) => ({ body: {
    ...rare, request, dataset_version: "isolated-ui-fixture", algorithm_version: "ui-test-v1",
    counts: { city_category_total: 2, eligible_total: 2, returned_total: 2 },
    exclusions: { ...rare.exclusions, booked: 0 },
    cards: ["UI-B", "UI-A"].map((id) => ({ ...rare.cards[0], id, anon_name: id,
      category: request.category, city: request.city, event_date: request.event_date,
      categories: [request.category], synthetic: true, source_kind: "team_added" })),
  } }));
  await page.locator('select[name="language"]').selectOption("казахский");
  await page.getByRole("button", { name: "Подобрать подрядчика", exact: true }).click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(2);
  const metadataCount = api.metadataRequests();
  expect(await cardIds(page)).toEqual(["UI-B", "UI-A"]);
  await english(page);
  await expect(page.locator('select[name="language"]')).toHaveValue("казахский");
  expect(await cardIds(page)).toEqual(["UI-B", "UI-A"]);
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  expect(await cardIds(page)).toEqual(["UI-B", "UI-A"]);
  expect(api.requests).toHaveLength(1);
  expect(api.requests[0].language).toBe("казахский");
  expect(api.metadataRequests()).toBe(metadataCount);
});

test("English explanations use the reviewed translation while evidence preserves the original quote", async ({ page }) => {
  await mockApi(page, (request) => ({ body: withGroundedExcerpt(request) }));
  await english(page);
  await fillRare(page);
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  const card = page.getByTestId("contractor-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".card-explanation")).toContainText(englishEvidence[quote]);
  await expect(card.locator(".card-explanation")).toContainText("200,000 ₸");
  await expect(card.getByTestId("price-imputed-note")).toContainText("imputed");
  await card.getByText("What supports this explanation", { exact: true }).click();
  await expect(card.getByText(quote, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(card.locator(".card-explanation")).toHaveText(rare.cards[0].explanation);
});

test("request failure can be retried and differs from over-budget and category-absent outcomes", async ({ page }) => {
  const api = await mockApi(page, (request, index) => {
    if (index === 0) return { status: 503, body: { detail: "Test service unavailable" } };
    if (index === 1) return { body: {
      ...unavailable, request,
      message: "Ни один подрядчик не проходит по бюджету.",
      exclusions: { ...unavailable.exclusions, booked: 0, over_budget: 1 },
    } };
    return { body: { ...absent, request } };
  });
  await english(page);
  await page.locator('select[name="city"]').selectOption("Астана");
  await page.locator('select[name="category"]').selectOption("Флорист");
  await page.locator('input[name="budget_kzt"]').fill("1");
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(page.getByTestId("request-error")).toBeVisible();
  await expect(page.getByTestId("result-summary")).toHaveCount(0);
  await expect(page.locator('input[name="budget_kzt"]')).toHaveValue("1");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const summary = page.getByTestId("result-summary");
  await expect(summary).toHaveAttribute("data-status", "no_eligible_contractors");
  await expect(summary).toContainText("No one meets the selected conditions");
  await expect(summary).toContainText("over budget");
  await expect(summary).not.toContainText("booked on this date");
  await expect(page.getByTestId("request-error")).toHaveCount(0);
  expect(api.requests[1]).toEqual(api.requests[0]);
  await page.locator('select[name="category"]').selectOption("Декоратор");
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(summary).toHaveAttribute("data-status", "category_absent");
  await expect(summary).toContainText("This category is absent in this city");
  await expect(page.getByTestId("contractor-card")).toHaveCount(0);
  expect(api.requests).toHaveLength(3);
});

test("375px layout supports keyboard submission and evidence in both interface languages", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page, (request) => ({ body: withGroundedExcerpt(request) }));
  await page.getByRole("button", { name: "English", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await fillRare(page);
  await page.getByRole("button", { name: "Find contractors", exact: true }).focus();
  await page.keyboard.press("Enter");
  const card = page.getByTestId("contractor-card");
  await expect(card).toHaveCount(1);
  const evidence = card.getByText("What supports this explanation", { exact: true });
  await evidence.focus();
  await page.keyboard.press("Enter");
  await expect(card.getByText(quote, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Русский", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("combobox", { name: "Город", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
