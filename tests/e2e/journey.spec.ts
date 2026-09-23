import { expect, test } from "@playwright/test";

// These user journeys use the real backend; only clipboard permission is simulated below.
test("root home -> category -> real shortlist -> honest inquiry -> back/forward", async ({ page, context }) => {
  const sent: string[] = [];
  page.on("request", request => { if (request.method() === "POST") sent.push(request.url()); });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();
  await expect(page.getByTestId("match-form")).toHaveCount(0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page).toHaveTitle("Tandau · Home");
  await page.getByRole("button", { name: /Florist.*requirements/ }).click();
  await expect(page).toHaveURL(/#\/match$/);
  await expect(page.locator('select[name="category"]')).toHaveValue("Флорист");
  expect(sent).toHaveLength(0); // A category click only fills the form.
  await page.locator('input[name="event_date"]').fill("2026-10-10");
  await page.locator('input[name="budget_kzt"]').fill("300000");
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  const card = page.getByTestId("contractor-card");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-contractor-id", "HK-39372");
  await card.getByText("Contact / prepare inquiry", { exact: true }).click();
  const contact = card.getByTestId("contact-panel");
  await expect(contact).toContainText("no verified phone numbers or emails");
  await expect(contact.locator('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')).toHaveCount(0);
  const draft = await contact.getByRole("textbox").inputValue();
  expect(draft).toContain("HK-39372");
  expect(draft).toContain("10.10.2026");
  expect(draft).toContain("300,000");
  await contact.getByRole("button", { name: "Copy inquiry" }).click();
  await expect(contact.getByRole("status")).toHaveText("Copied. No message was sent.");
  // Windows clipboard uses CRLF; normalize line endings, not the inquiry content.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(draft);
  expect(sent).toHaveLength(1); // Preparing/copying must never send a contact request.
  await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByTestId("home-page")).toBeVisible();
  await page.goBack();
  await expect(page.locator('input[name="budget_kzt"]')).toHaveValue("300000");
  await expect(card).toHaveCount(1); // Navigation preserves the shortlist, not another API call.
  expect(sent).toHaveLength(1);
  await page.goForward();
  await expect(page.getByTestId("home-page")).toBeVisible();
});

test("small-screen home and contact remain usable when copying is denied", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: /Как это работает/ }).click();
  await expect(page.locator("#how-it-works")).toBeInViewport();
  await page.getByRole("link", { name: /Начать подбор/ }).first().click();
  await page.getByRole("button", { name: "Подобрать подрядчика", exact: true }).click();
  const contact = page.getByTestId("contact-panel").first();
  await contact.locator("summary").click();
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }); });
  await contact.getByRole("button", { name: "Скопировать запрос" }).click();
  await expect(contact.getByRole("status")).toContainText("скопируйте его вручную");
  await expect(contact.getByRole("textbox")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
