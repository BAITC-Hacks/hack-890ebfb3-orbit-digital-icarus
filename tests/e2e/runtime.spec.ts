import { expect, test } from "@playwright/test";

// Probe through the browser origin: a healthy old matcher alone does not prove
// that the frontend proxy is connected to the current community application.
test("the running website serves its community API and favicon without stale-backend errors", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("response", response => {
    if (response.url().includes("/api/community/") && response.status() >= 400) {
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  for (const [path, field] of [["session", "user"], ["templates", "services"], ["listings", "listings"]]) {
    const response = await page.request.get(`/api/community/${path}`);
    expect(response.status(), `Missing ${path}: restart the backend from the current checkout`).toBe(200);
    expect(await response.json()).toHaveProperty(field);
  }
  const catalog = await page.request.get("/api/catalog");
  expect(catalog.status(), "The current backend must expose the supplied catalog").toBe(200);
  expect((await catalog.json()).profiles).toHaveLength(66);
  await Promise.all([
    ...["session", "templates"].map(path => page.waitForResponse(response => new URL(response.url()).pathname === `/api/community/${path}`)),
    page.goto("/#/providers"),
  ]);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByTestId("catalog-profile").first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Community listings", exact: true }).click();
  await expect(page.getByRole("search").locator("select").first().locator("option")).toHaveCount(4);
  // Both an empty real directory and existing user publications are valid.
  await expect(page.locator(".cm-results-line")).toContainText(/\d/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const iconPath = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(iconPath).toBe("/favicon.svg");
  const icon = await page.request.get(iconPath!);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expect(failures).toEqual([]);
});

test("anonymous visitors can browse supplied profiles separately from community accounts", async ({ page }) => {
  const response = await page.request.get("/api/catalog");
  expect(response.status()).toBe(200);
  const catalog = await response.json();
  const florists = catalog.profiles.filter((profile: { city: string; categories: string[] }) => profile.city === "Алматы" && profile.categories.includes("Флорист"));
  expect(florists).toHaveLength(2);
  await page.goto("/#/providers");
  await page.getByRole("button", { name: "English", exact: true }).click();
  const cards = page.getByTestId("catalog-profile");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(66); // The full directory is paginated, not a huge wall of cards.
  const filters = page.getByRole("search");
  await filters.getByRole("combobox").nth(0).selectOption("Алматы");
  await filters.getByRole("combobox").nth(1).selectOption("Флорист");
  await expect(cards).toHaveCount(2);
  for (const profile of florists) await expect(cards.filter({ hasText: profile.anon_name })).toHaveCount(1);
  await expect(page.getByTestId("community-listing")).toHaveCount(0);
  await filters.getByRole("searchbox").fill(florists[0].id);
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".theme-toggle").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
