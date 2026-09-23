import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { MatchRequest, MatchResponse, MetadataResponse } from "../../frontend/src/api/types";

// These regressions isolate browser editing/validation; no API or paid calls.
const rare: MatchResponse = JSON.parse(readFileSync(resolve("contracts/examples/matches_found.json"), "utf8"));
const metadata: MetadataResponse = {
  cities: ["Алматы", "Астана"], categories: ["Ведущий", "Флорист"],
  event_formats: ["свадьба"], languages: ["русский", "английский"],
  calendar_start: "2026-09-23", calendar_end: "2026-12-31",
};

async function setup(page: Page) {
  const requests: MatchRequest[] = [];
  await page.route("**/api/metadata", route => route.fulfill({ json: metadata }));
  await page.route("**/api/match", async route => {
    const request = route.request().postDataJSON() as MatchRequest;
    requests.push(request);
    await route.fulfill({ json: { ...rare, request } });
  });
  await page.goto("/#/match");
  const submit = page.getByTestId("match-form").locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await page.locator('select[name="category"]').selectOption("Флорист");
  await page.locator('input[name="event_date"]').fill("2026-10-10");
  const budget = page.locator('input[name="budget_kzt"]');
  const duration = page.locator('input[name="duration_hours"]');
  await budget.fill("300000");
  return { budget, duration, requests, submit };
}

/** Cancelable paste + its default text insertion, without touching OS clipboard. */
async function pasteText(page: Page, input: Locator, text: string) {
  await input.focus();
  await input.press("ControlOrMeta+A");
  const insert = await input.evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    return element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  }, text);
  if (insert) await page.keyboard.insertText(text);
}

test("numeric text controls reject exponent letters, signs and other typed letters", async ({ page }) => {
  const { budget, duration, requests } = await setup(page);
  await expect(budget).toHaveAttribute("type", "text");
  await expect(budget).toHaveAttribute("inputmode", "numeric");
  await expect(duration).toHaveAttribute("type", "text");
  await expect(duration).toHaveAttribute("inputmode", "decimal");
  for (const input of [budget, duration]) {
    await input.fill("4");
    for (const character of ["e", "E", "+", "-", "a", "я"]) {
      await input.press("End");
      await input.pressSequentially(character);
      await expect(input).toHaveValue("4");
    }
  }
  expect(requests).toHaveLength(0);
});

test("invalid pasted text is rejected atomically and blocks submission until corrected", async ({ page }) => {
  const { budget, duration, requests, submit } = await setup(page);
  for (const text of ["4e2", "4E2", "4.5", "4,5", "+4", "-4", "4 5", "4x"]) {
    await budget.fill("");
    await budget.fill("300000");
    await pasteText(page, budget, text);
    await expect(budget).toHaveValue("300000");
    await submit.click();
    await expect(budget).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(0);
  }
  await budget.fill("");
  await budget.fill("300000");
  for (const text of ["4e", "4e2", "4E2", "+4", "-4", "4..5", "4,5.6", "4 hours"]) {
    await duration.fill("");
    await duration.fill("4");
    await pasteText(page, duration, text);
    await expect(duration).toHaveValue("4");
    await submit.click();
    await expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(0);
  }
});

test("duration keeps editable dot or comma drafts and submits either decimal as 4.5", async ({ page }) => {
  const { duration, requests, submit } = await setup(page);
  await page.getByRole("button", { name: "English", exact: true }).click();
  for (const separator of [".", ","]) {
    await duration.fill("");
    await duration.pressSequentially(`4${separator}`);
    await expect(duration).toHaveValue(`4${separator}`);
    await duration.pressSequentially("5");
    await expect(duration).toHaveValue(`4${separator}5`);
    await submit.click();
    await expect(page.getByTestId("contractor-card")).toHaveCount(1);
    expect(requests.at(-1)?.duration_hours).toBe(4.5);
  }
  expect(requests).toHaveLength(2);
});

test("empty numeric fields accept numbers immediately after rejected letters", async ({ page }) => {
  const { budget, duration, requests, submit } = await setup(page);
  await budget.fill("");
  for (const [input, corrected] of [[budget, "300000"], [duration, "6,5"]] as const) {
    await input.pressSequentially("e");
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    // The exact user report: simply type a number next, without special recovery keys.
    await input.pressSequentially(corrected);
    await expect(input).toHaveValue(corrected);
    await expect(input).toHaveAttribute("aria-invalid", "false");
  }
  await submit.click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].budget_kzt).toBe(300000);
  expect(requests[0].duration_hours).toBe(6.5);
});

test("empty duration recovers after rejected paste and mobile-style insertion without keydown", async ({ page }) => {
  const { duration, requests, submit } = await setup(page);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const rejection of ["paste", "insert"]) {
    await duration.fill("");
    if (rejection === "paste") await pasteText(page, duration, "4e2");
    else { await duration.focus(); await page.keyboard.insertText("e"); }
    await expect(duration).toHaveValue("");
    await submit.click();
    expect(requests).toHaveLength(rejection === "paste" ? 0 : 1);
    await duration.focus();
    await page.keyboard.insertText("6.5");
    await expect(duration).toHaveValue("6.5");
    await expect(duration).toHaveAttribute("aria-invalid", "false");
    await submit.click();
    await expect(page.getByTestId("contractor-card")).toHaveCount(1);
    expect(requests.at(-1)?.duration_hours).toBe(6.5);
  }
  expect(requests).toHaveLength(2);
});

test("nonblank invalid duration never becomes an omitted filter; deliberate clearing does", async ({ page }) => {
  const { duration, requests, submit } = await setup(page);
  for (const draft of [".", ",", "4.", "4,", "0", "0.0"]) {
    await duration.fill(draft);
    await submit.click();
    await expect(duration).toHaveValue(draft);
    await expect(duration).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("request-error")).toBeVisible();
    expect(requests).toHaveLength(0);
  }
  await duration.fill("");
  await pasteText(page, duration, "4e");
  await expect(duration).toHaveValue("");
  await submit.click();
  await expect(duration).toHaveAttribute("aria-invalid", "true");
  expect(requests).toHaveLength(0);

  // A deliberate edit followed by clearing is the user's explicit omission.
  await duration.fill("4");
  await duration.fill("");
  await submit.click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].duration_hours).toBeNull();
});

test("budget rejects empty, zero and unsafe integer values without sending a request", async ({ page }) => {
  const { budget, requests, submit } = await setup(page);
  for (const draft of ["", "0", "000", "9007199254740992"]) {
    await budget.fill(draft);
    await submit.click();
    await expect(budget).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("request-error")).toBeVisible();
    expect(requests).toHaveLength(0);
  }
  await budget.fill("300000");
  await submit.click();
  await expect(page.getByTestId("contractor-card")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].budget_kzt).toBe(300000);
});

test("a rejected character cannot silently concatenate a different numeric request", async ({ page }) => {
  const { budget, duration, requests, submit } = await setup(page);
  for (const text of ["4.5", "4,5", "4e2", "4E2", "4+5", "4-5"]) {
    await budget.fill("");
    await budget.pressSequentially(text);
    await submit.click();
    await expect(budget).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(0);
  }
  await budget.fill("");
  await budget.fill("300000");
  for (const text of ["4e2", "4E2", "4+5", "4-5"]) {
    await duration.fill("");
    await duration.pressSequentially(text);
    await submit.click();
    await expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(0);
  }
});
