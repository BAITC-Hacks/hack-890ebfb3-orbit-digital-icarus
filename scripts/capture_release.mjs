import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Capture reproducible product screenshots against the real local API, not fixtures.
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch();
try {
  await mkdir("docs/images", { recursive: true });
  await mkdir("artifacts", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(baseURL);
  await page.getByRole("button", { name: /Флорист.*Открыть/ }).waitFor();
  await page.screenshot({ path: "docs/images/home-ru.png", fullPage: true });
  await page.screenshot({ path: "artifacts/home-desktop.png" });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.screenshot({ path: "artifacts/home-english.png" });
  await page.getByRole("navigation").getByRole("link", { name: "Find a match", exact: true }).click();
  await page.getByRole("button", { name: "Find contractors", exact: true }).click();
  await page.getByTestId("contractor-card").first().waitFor();
  await page.screenshot({ path: "docs/images/interface-en.png", fullPage: true });
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await page.screenshot({ path: "docs/images/interface-ru.png", fullPage: true });
  const contact = page.getByTestId("contact-panel").first();
  await contact.locator("summary").click();
  await page.setViewportSize({ width: 375, height: 812 });
  await contact.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/contact-mobile.png" });
  await page.getByRole("navigation").getByRole("link", { name: "Главная", exact: true }).click();
  await page.screenshot({ path: "artifacts/home-mobile.png", fullPage: true });
  console.log("Captured live home, RU/EN shortlist and mobile inquiry screenshots.");
} finally {
  await browser.close(); // Leave no headless browser behind after a capture failure.
}
