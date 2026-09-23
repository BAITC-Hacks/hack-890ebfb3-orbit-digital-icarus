import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// These flows use real persisted accounts/listings and separate browser cookie jars.
// Set COMMUNITY_DB_PATH on the server to an ignored test DB before running them.
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const password = "Tandau-demo-only-2026";

async function openEnglish(page: Page, path: string) {
  await page.goto(`${base}/#/${path}`);
  await page.getByRole("button", { name: "English", exact: true }).click();
}

async function signupUI(page: Page, username: string, provider: boolean) {
  await openEnglish(page, "account");
  const form = page.getByTestId("auth-form");
  await expect(form).toBeVisible();
  await form.locator(`input[name="role"][value="${provider ? "provider" : "organizer"}"]`).check();
  await form.locator('[name="display_name"]').fill(provider ? "Demo florist" : "Demo organizer");
  await form.locator('[name="username"]').fill(username);
  await form.locator('[name="password"]').fill(password);
  await form.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

async function seedProvider(context: BrowserContext, username: string, category: string) {
  const registration = await context.request.post(`${base}/api/community/register`, {
    data: { username, password, display_name: category === "Кейтеринг" ? "Demo caterer" : "Demo band", role: "provider" },
  });
  expect(registration.status()).toBe(201);
  const published = await context.request.post(`${base}/api/community/listings`, {
    data: { title: category === "Кейтеринг" ? "Seasonal event menu (demo)" : "Live music for your evening (demo)", category, city: "Алматы", price_from_kzt: 150000,
      description: `A local demonstration listing for the agreed event service. Test reference: ${username}.`, active: true },
  });
  expect(published.status()).toBe(201);
  return published.json();
}

test("public browsing and authenticated event gate work in RU/EN, light/dark and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openEnglish(page, "providers");
  await expect(page.getByRole("heading", { name: "Good people. Great gatherings." })).toBeVisible();
  await expect(page.getByTestId("auth-form")).toHaveCount(0);
  for (const language of ["Русский", "English"]) {
    await page.getByRole("button", { name: language, exact: true }).click();
    for (let theme = 0; theme < 2; theme++) {
      await page.locator(".theme-toggle").click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const toggle = await page.locator(".theme-toggle").boundingBox();
      expect(toggle!.width).toBeGreaterThanOrEqual(44);
      expect(toggle!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole("navigation").getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByText("A shared plan starts with an account.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("event-form")).toHaveCount(0);
  expect((await page.request.get(`${base}/api/community/events`)).status()).toBe(401);
  await page.getByRole("navigation").getByRole("link", { name: "Find a match", exact: true }).click();
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(3);
});

test("three providers explicitly accept an editable event plan and share private chat", async ({ browser, page }) => {
  test.setTimeout(120_000);
  const run = `t${Date.now().toString(36)}`;
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ baseURL: base })));
  const [floristPage, catererPage, bandPage] = await Promise.all(contexts.map(c => c.newPage()));
  const pageErrors: string[] = [];
  for (const p of [page, floristPage, catererPage, bandPage]) p.on("pageerror", error => pageErrors.push(error.message));
  try {
    // Exercise provider signup and publication through UI, not only HTTP setup.
    await signupUI(floristPage, `${run}_florist`, true);
    await floristPage.getByRole("button", { name: /New listing/ }).click();
    const listingForm = floristPage.getByTestId("listing-form");
    await listingForm.locator('[name="title"]').fill("Seasonal event flowers (demo)");
    await listingForm.locator('[name="category"]').selectOption("Флорист");
    await listingForm.locator('[name="city"]').selectOption("Алматы");
    const price = listingForm.locator('[name="price"]');
    await price.pressSequentially("e");
    await expect(price).toHaveValue("");
    await price.fill("120000");
    await listingForm.locator('[name="description"]').fill(`Seasonal flowers, a ceremony arch and table arrangements for the agreed event. Local demo reference: ${run}.`);
    await listingForm.getByRole("button", { name: "Publish a service", exact: true }).click();
    await expect(floristPage.getByTestId("community-listing")).toHaveCount(1);
    const ownListings = await (await contexts[0].request.get(`${base}/api/community/listings?mine=true`)).json();
    const florist = ownListings.listings[0];
    const caterer = await seedProvider(contexts[1], `${run}_caterer`, "Кейтеринг");
    const band = await seedProvider(contexts[2], `${run}_band`, "Лайв-бэнд");

    // Public directory works before the organizer registers.
    await openEnglish(page, "providers");
    await page.getByRole("searchbox").fill(run);
    await expect(page.getByTestId("community-listing")).toHaveCount(3);
    await signupUI(page, `${run}_owner`, false);
    await page.getByRole("navigation").getByRole("link", { name: "Events", exact: true }).click();
    await page.getByRole("button", { name: /Create an event/ }).click();
    const eventForm = page.getByTestId("event-form");
    await eventForm.locator('[name="title"]').fill("Autumn celebration · demo");
    await eventForm.locator('[name="event_date"]').fill("2026-10-11");
    await eventForm.locator('[name="template_id"]').selectOption("wedding");
    await eventForm.getByRole("button", { name: "Create plan", exact: true }).click();
    await expect(page.getByTestId("event-slot")).toHaveCount(6);
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    // Keep the three requested services; removal is intentional and must be saved.
    for (const category of ["Банкетный зал", "Ведущий", "Фотограф"]) {
      const slots = page.getByTestId("event-slot");
      for (let i = 0; i < await slots.count(); i++) {
        if (await slots.nth(i).locator("select").inputValue() === category) {
          await slots.nth(i).getByRole("button", { name: /Remove service/ }).click();
          break;
        }
      }
    }
    await page.getByTestId("event-slot").first().getByRole("textbox", { name: "Service notes", exact: true }).fill("Ivory flowers; confirm setup at 16:00.");
    await page.getByTestId("event-slot").first().getByRole("button", { name: /Add task/ }).click();
    await page.getByTestId("event-slot").first().getByRole("textbox", { name: "Task 1.4", exact: true }).fill("Confirm the delivery entrance");
    await page.getByTestId("plan-save").click();
    await expect(page.getByTestId("plan-save")).toHaveCount(0);
    await expect(page.getByTestId("event-slot")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Team still coming together", exact: true })).toBeVisible();

    for (const [index, listing] of [florist, caterer, band].entries()) {
      const slot = page.getByTestId("event-slot").nth(index);
      await slot.getByRole("button", { name: /Invite a provider/ }).click();
      await slot.getByRole("combobox").selectOption(listing.id);
      await slot.getByRole("button", { name: "Send invitation", exact: true }).click();
      await expect(slot.getByText("Invited · awaiting reply", { exact: true })).toBeVisible();
    }
    await page.getByTestId("chat-form").getByRole("textbox").fill("Private owner briefing before acceptance.");
    await page.getByTestId("chat-form").getByRole("button").click();
    for (const providerPage of [floristPage, catererPage, bandPage]) {
      await openEnglish(providerPage, "events");
      await providerPage.getByRole("button", { name: /Autumn celebration · demo/ }).click();
      await expect(providerPage.getByText("Accept an invitation to join the private chat.", { exact: true })).toBeVisible();
      await expect(providerPage.getByTestId("chat-message")).toHaveCount(0);
      await providerPage.getByRole("button", { name: "Accept this plan", exact: true }).click();
      await expect(providerPage.getByTestId("chat-form")).toBeVisible();
      await expect(providerPage.getByTestId("chat-message")).toContainText(["Private owner briefing before acceptance."]);
    }
    await expect(page.getByRole("heading", { name: "All providers confirmed", exact: true })).toBeVisible();
    await floristPage.getByTestId("chat-form").getByRole("textbox").fill("Flowers confirmed. Catering and band: let's agree on access times.");
    await floristPage.getByTestId("chat-form").getByRole("button").click();
    await expect(catererPage.getByTestId("chat-message").last()).toContainText("Flowers confirmed.");
    await expect(bandPage.getByTestId("chat-message").last()).toContainText("Flowers confirmed.");
    await expect(page.getByTestId("chat-message").last()).toContainText("Flowers confirmed.");

    // Same real event on narrow screens and both themes; no fixture substitutions.
    for (const language of ["Русский", "English"]) {
      await page.getByRole("button", { name: language, exact: true }).click();
      await page.setViewportSize({ width: 375, height: 812 });
      for (let theme = 0; theme < 2; theme++) {
        await page.locator(".theme-toggle").click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.getByTestId("chat-form").getByRole("textbox")).toBeEnabled();
        await expect(page.getByTestId("chat-form").getByRole("button")).toBeDisabled(); // Empty messages cannot be sent.
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (process.env.CAPTURE_COMMUNITY === "1") {
      await mkdir("docs/images", { recursive: true });
      if (await page.locator("html").getAttribute("data-theme") !== "dark") await page.locator(".theme-toggle").click();
      await page.screenshot({ path: "docs/images/community-team-en.png", fullPage: true });
    }

    // Checklist progress preserves agreement; scope changes require renewed consent.
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    await page.getByRole("checkbox", { name: "Mark task complete 1.1", exact: true }).check();
    await page.getByTestId("plan-save").click();
    await expect(page.getByTestId("plan-save")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "All providers confirmed", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    await page.getByTestId("event-slot").first().getByRole("textbox", { name: "Service notes", exact: true }).fill("Changed scope: red flowers and setup at 14:00.");
    await page.getByTestId("plan-save").click();
    await expect(page.getByRole("heading", { name: "Team still coming together", exact: true })).toBeVisible();
    await expect(floristPage.getByTestId("chat-form")).toHaveCount(0);
    await expect(floristPage.getByTestId("chat-message")).toHaveCount(0);
    await expect(floristPage.getByRole("button", { name: "Accept this plan", exact: true })).toBeVisible();
    await floristPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(floristPage.getByTestId("event-detail")).toHaveCount(0);
    expect((await contexts[0].request.get(`${base}/api/community/events`)).status()).toBe(401);
    expect(pageErrors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("date comparison explains booked and displaced profiles without changing matching", async ({ page }) => {
  await openEnglish(page, "match");
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(3);
  await page.locator('[name="event_date"]').fill("2026-10-10");
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(page.getByTestId("date-comparison").locator('[data-reason="booked"]')).toHaveCount(2);
  await page.locator('[name="event_date"]').fill("2026-10-11");
  await expect(page.getByTestId("date-comparison")).toHaveCount(0);
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await expect(page.getByTestId("date-comparison").locator('[data-reason="out_ranked"]')).toHaveCount(2);
  await expect(page.getByTestId("date-comparison").locator('[data-reason="booked"]')).toHaveCount(0);
});
