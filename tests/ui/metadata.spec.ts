import { expect, test } from "@playwright/test";
import type { MetadataResponse } from "../../frontend/src/api/types";

const metadata: MetadataResponse = {
  cities: ["Алматы", "Астана"], categories: ["Ведущий", "Флорист"],
  event_formats: ["свадьба", "корпоратив"], languages: ["русский", "английский"],
  calendar_start: "2026-09-23", calendar_end: "2026-12-31",
};

test("a stalled catalog request times out and a retry restores the form", async ({ page }) => {
  // Clock control advances only this page; no backend or real delay is required.
  await page.clock.install();
  let stalled = true;
  let metadataRequests = 0;
  let matchRequests = 0;
  await page.route("**/api/metadata", async route => {
    metadataRequests += 1;
    if (stalled) return; // Intentionally keep the intercepted request pending.
    await route.fulfill({ json: metadata });
  });
  await page.route("**/api/match", async route => {
    matchRequests += 1;
    await route.abort();
  });
  await page.goto("/");
  const form = page.getByTestId("match-form");
  const submit = form.locator('button[type="submit"]');
  const city = form.locator('select[name="city"]');
  await expect.poll(() => metadataRequests).toBeGreaterThan(0);
  await expect(submit).toBeDisabled();
  await expect(city).toBeDisabled();
  await expect(page.getByTestId("metadata-error")).toHaveCount(0);

  await page.clock.fastForward(10_001);
  const error = page.getByTestId("metadata-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("Не удалось загрузить параметры каталога");
  await expect(submit).toBeDisabled();
  await expect(page.getByTestId("result-summary")).toHaveCount(0);

  const beforeRetry = metadataRequests;
  stalled = false;
  await error.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(submit).toBeEnabled();
  await expect(city).toBeEnabled();
  await expect(error).toHaveCount(0);
  await expect(form.locator('input[name="event_date"]')).toHaveAttribute("min", metadata.calendar_start);
  await expect(form.locator('input[name="event_date"]')).toHaveAttribute("max", metadata.calendar_end);
  expect(metadataRequests).toBe(beforeRetry + 1);
  expect(matchRequests).toBe(0);
});
