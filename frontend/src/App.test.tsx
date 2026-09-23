import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const fixtureIds = ["HK-42352", "HK-77838", "HK-72938"];
const fetch = vi.fn(() => Promise.reject(new Error("Component fixtures must not call the network")));

async function renderPreview() {
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Подобрать подрядчика", exact: true })).toBeEnabled());
  expect(screen.getByRole("note")).toHaveTextContent("Предпросмотр на примерах");
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Подобрать подрядчика", exact: true }));
}

describe("App: explicit demo fixtures, not production matching", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#/match"); // These legacy fixtures exercise the matching route.
    fetch.mockClear();
    window.localStorage.setItem("contractor-match-theme", "dark");
    vi.stubGlobal("fetch", fetch);
  });

  afterEach(() => expect(fetch).not.toHaveBeenCalled());

  it("renders every required field and all global categories after metadata is ready", async () => {
    const user = userEvent.setup();
    await renderPreview();

    expect(screen.getByRole("combobox", { name: "Город", exact: true })).toBeVisible();
    expect(screen.getByLabelText("Дата мероприятия")).toHaveValue("2026-10-11");
    expect(screen.getByRole("combobox", { name: "Формат мероприятия", exact: true })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Категория подрядчика", exact: true })).toBeVisible();
    expect(screen.getByLabelText("Бюджет, ₸")).toHaveDisplayValue("3000000");
    expect(screen.getByLabelText(/Длительность, ч/)).toBeVisible();
    expect(screen.getByRole("combobox", { name: /Язык работы подрядчика/ })).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Город", exact: true }), "Астана");
    expect(screen.getByRole("option", { name: "Декоратор" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Инструменталист" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("switches the visual theme and remembers the choice", async () => {
    const user = userEvent.setup();
    await renderPreview();

    const toggle = screen.getByRole("button", { name: "Включить светлую тему" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("contractor-match-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Включить тёмную тему" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens Tandau's product journey first and carries a selected category into matching", async () => {
    window.history.replaceState(null, "", "/");
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("home-page")).toBeVisible();
    expect(screen.queryByTestId("match-form")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Флорист/ }));
    await waitFor(() => expect(screen.getByTestId("match-form")).toBeVisible());
    expect(screen.getByRole("combobox", { name: "Категория подрядчика" })).toHaveValue("Флорист");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders the demonstration shortlist in fixture order and preserves it in English", async () => {
    const user = userEvent.setup();
    await renderPreview();

    await submit(user);

    const summary = await screen.findByTestId("result-summary");
    expect(summary).toHaveAttribute("data-status", "matches_found");
    expect(summary).toHaveAttribute("data-request-date", "2026-10-11");
    expect(within(summary).getByRole("heading", { name: "Подходят 3 подрядчика" })).toBeVisible();
    expect(screen.getAllByTestId("contractor-card").map(card => card.dataset.contractorId)).toEqual(fixtureIds);
    await user.click(screen.getByRole("button", { name: "English", exact: true }));
    expect(within(summary).getByRole("heading", { name: "Found 3 matches" })).toBeVisible();
    expect(screen.getAllByTestId("contractor-card").map(card => card.dataset.contractorId)).toEqual(fixtureIds);
    expect(screen.getByRole("note")).toHaveTextContent("Example preview");
    expect(document.documentElement.lang).toBe("en");
  });

  it("keeps the category-absent state distinct from other empty results", async () => {
    const user = userEvent.setup();
    await renderPreview();

    await user.selectOptions(screen.getByRole("combobox", { name: "Город", exact: true }), "Астана");
    await user.selectOptions(screen.getByRole("combobox", { name: "Категория подрядчика", exact: true }), "Декоратор");
    await submit(user);

    const summary = await screen.findByTestId("result-summary");
    expect(summary).toHaveAttribute("data-status", "category_absent");
    expect(within(summary).getByRole("heading", { name: "В этом городе такой категории нет" })).toBeVisible();
    expect(screen.queryByTestId("contractor-card")).not.toBeInTheDocument();
  });

  it("renders the no-eligible-contractors state without cards", async () => {
    const user = userEvent.setup();
    await renderPreview();

    await user.selectOptions(screen.getByRole("combobox", { name: "Город", exact: true }), "Астана");
    await user.selectOptions(screen.getByRole("combobox", { name: "Категория подрядчика", exact: true }), "Флорист");
    await submit(user);

    const summary = await screen.findByTestId("result-summary");
    expect(summary).toHaveAttribute("data-status", "no_eligible_contractors");
    expect(within(summary).getByRole("heading", { name: "Никто не подходит под выбранные условия" })).toBeVisible();
    expect(within(summary).getByText(/профиль, но на выбранную дату он занят/i)).toBeVisible();
    expect(screen.queryByTestId("contractor-card")).not.toBeInTheDocument();
  });

  it("shows the data-quality note for an imputed price", async () => {
    const user = userEvent.setup();
    await renderPreview();

    await user.selectOptions(screen.getByRole("combobox", { name: "Категория подрядчика", exact: true }), "Флорист");
    await submit(user);

    expect(await screen.findByTestId("price-imputed-note")).toHaveTextContent("Стартовая цена восстановлена из данных");
    expect(screen.getAllByTestId("contractor-card")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "English", exact: true }));
    expect(screen.getByTestId("price-imputed-note")).toHaveTextContent("Starting price was imputed in the supplied data");
  });

  it("keeps a grouped multi-million budget intact through submission", async () => {
    const user = userEvent.setup();
    await renderPreview();
    const budget = screen.getByLabelText("Бюджет, ₸");
    await user.clear(budget);
    await user.type(budget, "4 000 000");
    await user.tab();
    expect(budget).toHaveDisplayValue("4 000 000");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toHaveAttribute("data-status", "matches_found");
    expect(screen.getByText(/^до 4\s000\s000 ₸$/)).toBeVisible();
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
  });

  it("rejects duration letters with an error and accepts a corrected comma decimal", async () => {
    const user = userEvent.setup();
    await renderPreview();
    const duration = screen.getByLabelText(/Длительность, ч/);
    await user.type(duration, "6abc,5");
    expect(duration).toHaveDisplayValue("6");
    await submit(user);
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(await screen.findByTestId("request-error")).toBeVisible();
    expect(screen.queryByTestId("result-summary")).not.toBeInTheDocument();
    await user.clear(duration);
    await user.type(duration, "6,5");
    expect(duration).toHaveDisplayValue("6,5");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toHaveAttribute("data-status", "matches_found");
    expect(screen.getByText("6.5 ч")).toBeVisible();
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
  });

  it("accepts positive quarter-hour duration without inventing a half-hour restriction", async () => {
    const user = userEvent.setup();
    await renderPreview();
    const duration = screen.getByLabelText(/Длительность, ч/);
    await user.type(duration, "1.25");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toHaveAttribute("data-status", "matches_found");
    expect(duration).toHaveDisplayValue("1.25");
    expect(screen.getByText("1.25 ч")).toBeVisible();
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
  });

  it("rejects empty and out-of-range dates before matching and accepts a correction", async () => {
    const user = userEvent.setup();
    await renderPreview();
    const date = screen.getByLabelText("Дата мероприятия");
    for (const value of ["", "2026-09-22", "2027-01-01"]) {
      fireEvent.change(date, { target: { value } });
      await submit(user);
      expect(date).toHaveAttribute("aria-invalid", "true");
      expect(date).toHaveAccessibleDescription(/23\.09\.2026–31\.12\.2026/);
      expect(await screen.findByTestId("request-error")).toBeVisible();
      expect(screen.queryByTestId("result-summary")).not.toBeInTheDocument();
    }
    fireEvent.change(date, { target: { value: "2026-10-31" } });
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toHaveAttribute("data-request-date", "2026-10-31");
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
  });

  it("rejects invalid budget edits without silently changing their meaning", async () => {
    const user = userEvent.setup();
    await renderPreview();

    const budget = screen.getByLabelText("Бюджет, ₸");
    await user.clear(budget);
    // Malformed thousands grouping is kept visible and blocked, never repaired into 400000 or 4.
    await user.type(budget, "4 00 000");
    await user.tab();

    expect(budget).toHaveValue("4 00 000");
    await submit(user);
    expect(budget).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("result-summary")).not.toBeInTheDocument();
    await user.clear(budget);
    await user.type(budget, "4000000");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toBeVisible();
  });

  it("blocks duration letters and accepts a corrected comma decimal", async () => {
    const user = userEvent.setup();
    await renderPreview();

    const duration = screen.getByLabelText(/Длительность, ч/i);
    await user.type(duration, "6abc,5");

    expect(duration).toHaveValue("6");
    await submit(user);
    expect(duration).toHaveAttribute("aria-invalid", "true");
    await user.clear(duration);
    await user.type(duration, "6,5");
    expect(duration).toHaveValue("6,5");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toBeVisible();
  });

  it("accepts digits immediately after rejecting a letter in an empty duration", async () => {
    const user = userEvent.setup();
    await renderPreview();
    const duration = screen.getByLabelText("Длительность, ч", { exact: true });
    await user.type(duration, "e");
    expect(duration).toHaveValue("");
    expect(duration).toHaveAttribute("aria-invalid", "true");
    // No clearing, refocusing or reload should be necessary to enter a fresh number.
    await user.type(duration, "6,5");
    expect(duration).toHaveValue("6,5");
    expect(duration).toHaveAttribute("aria-invalid", "false");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toBeVisible();
  });

  it("accepts fractional durations below the ceiling without inventing a half-hour constraint", async () => {
    const user = userEvent.setup();
    await renderPreview();

    await user.type(screen.getByLabelText(/Длительность, ч/i), "1.25");
    await submit(user);

    expect(await screen.findByTestId("result-summary")).toBeVisible();
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
  });

  it("flags a duration over 12 immediately and accepts a corrected boundary value", async () => {
    const user = userEvent.setup();
    await renderPreview();
    const duration = screen.getByLabelText("Длительность, ч", { exact: true });
    await user.type(duration, "4903");
    expect(duration).toHaveValue("4903"); // Show what was entered; never silently truncate it to 4.
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Введите длительность больше 0 и не более 12/)).toBeVisible();
    await submit(user);
    expect(screen.queryByTestId("result-summary")).not.toBeInTheDocument();
    await user.clear(duration);
    await user.type(duration, "12");
    expect(duration).toHaveAttribute("aria-invalid", "false");
    await submit(user);
    expect(await screen.findByTestId("result-summary")).toBeVisible();
  });

  it("rejects an empty or out-of-range event date before calling the API", async () => {
    const user = userEvent.setup();
    await renderPreview();

    await user.clear(screen.getByLabelText("Дата мероприятия"));
    await submit(user);

    expect(await screen.findByTestId("request-error")).toBeVisible();
    expect(screen.getByLabelText(/Дата мероприятия/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("result-summary")).not.toBeInTheDocument();
  });
});
