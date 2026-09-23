import { render, screen, waitFor, within } from "@testing-library/react";
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
    fetch.mockClear();
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
});
