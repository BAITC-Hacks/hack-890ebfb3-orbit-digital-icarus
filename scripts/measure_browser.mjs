/** Measure the real Russian-default form against a running API, without fixtures. */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const base = { city: "Алматы", category: "Ведущий", event_format: "свадьба", event_date: "2026-10-11", budget_kzt: 3000000 };
const cases = [
  ["dense", base, ["HK-42352", "HK-44923", "HK-27222"]],
  ["date_change", { ...base, event_date: "2026-10-10" }, ["HK-27222", "HK-77838", "HK-72938"]],
  ["rare", { ...base, category: "Флорист", event_date: "2026-10-10", budget_kzt: 300000 }, ["HK-39372"]],
  ["absent", { ...base, city: "Астана", category: "Декоратор", event_date: "2026-10-10" }, []],
  ["booked", { ...base, city: "Астана", category: "Флорист", budget_kzt: 300000 }, []],
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL("/#/match", baseURL).href); // Measure submit-to-result, not home navigation.
  const measurements = [];
  for (let repeat = 0; repeat < 4; repeat += 1) {
    for (const [scenario, payload, ids] of cases) {
      for (const field of ["city", "category", "event_format"]) {
        await page.locator(`select[name="${field}"]`).selectOption(payload[field]);
      }
      await page.locator('input[name="event_date"]').fill(payload.event_date);
      await page.locator('input[name="budget_kzt"]').fill(String(payload.budget_kzt));
      const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/match") && response.request().method() === "POST");
      const started = performance.now();
      await page.getByTestId("match-form").locator('button[type="submit"]').click();
      const response = await responsePromise;
      if (!response.ok()) throw new Error(`Real API returned HTTP ${response.status()}`);
      const body = await response.json();
      await page.getByTestId("result-summary").waitFor({ state: "visible" });
      await page.waitForFunction((expected) => {
        const actual = [...document.querySelectorAll('[data-testid="contractor-card"]')].map((card) => card.getAttribute("data-contractor-id"));
        return JSON.stringify(actual) === JSON.stringify(expected);
      }, ids);
      const elapsedMs = performance.now() - started;
      if (JSON.stringify(body.cards.map((card) => card.id)) !== JSON.stringify(ids)) throw new Error("API differs from frozen dataset scenario");
      if (body.dataset_version !== "6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d") throw new Error("Unexpected data source");
      measurements.push({ scenario, repeat, elapsed_ms: Number(elapsedMs.toFixed(2)), status: body.status, algorithm_version: body.algorithm_version });
      if (elapsedMs >= 10000) throw new Error("Submit-to-visible result exceeded ten seconds");
    }
  }
  const times = measurements.map((row) => row.elapsed_ms).sort((a, b) => a - b);
  const report = {
    scope: "real browser submit-to-visible result, including automation click/wait overhead; no intercepted API responses",
    recorded_utc: new Date().toISOString(), browser: browser.version(), platform: process.platform,
    runs: measurements.length, p95_ms: times[Math.ceil(times.length * .95) - 1], max_ms: times.at(-1), measurements,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/browser-latency.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
