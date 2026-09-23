import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Подобрать подрядчика" }));
}

describe("App preview flow", () => {
  it("renders every required field and all global categories", () => {
    render(<App />);

    expect(screen.getByLabelText("Город")).toBeVisible();
    expect(screen.getByLabelText("Дата мероприятия")).toHaveValue("2026-10-11");
    expect(screen.getByLabelText("Тип мероприятия")).toBeVisible();
    expect(screen.getByLabelText("Категория подрядчика")).toBeVisible();
    expect(screen.getByLabelText("Бюджет, ₸")).toHaveValue(3_000_000);
    expect(screen.getByRole("option", { name: "Декоратор" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Инструменталист" })).toBeInTheDocument();
  });

  it("renders a matching shortlist in the fixture order", async () => {
    const user = userEvent.setup();
    render(<App />);

    await submit(user);

    const summary = await screen.findByTestId("result-summary");
    expect(summary).toHaveAttribute("data-status", "matches_found");
    expect(summary).toHaveAttribute("data-request-date", "2026-10-11");
    expect(within(summary).getByRole("heading", { name: "Нашли 3 подходящих" })).toBeVisible();
    expect(screen.getAllByTestId("contractor-card").map((card) => card.dataset.contractorId)).toEqual([
      "HK-42352", "HK-77838", "HK-72938",
    ]);
  });

  it("keeps the category-absent state distinct from other empty results", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("Город"), "Астана");
    await user.selectOptions(screen.getByLabelText("Категория подрядчика"), "Декоратор");
    await submit(user);

    const summary = await screen.findByTestId("result-summary");
    expect(summary).toHaveAttribute("data-status", "category_absent");
    expect(within(summary).getByRole("heading", { name: "В этом городе такой категории нет" })).toBeVisible();
    expect(screen.queryByTestId("contractor-card")).not.toBeInTheDocument();
  });

  it("renders the no-eligible-contractors state without cards", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("Город"), "Астана");
    await user.selectOptions(screen.getByLabelText("Категория подрядчика"), "Флорист");
    await submit(user);

    const summary = await screen.findByTestId("result-summary");
    expect(summary).toHaveAttribute("data-status", "no_eligible_contractors");
    expect(within(summary).getByRole("heading", { name: "На эту дату свободных вариантов нет" })).toBeVisible();
    expect(within(summary).getByText(/профиль, но на выбранную дату он занят/i)).toBeVisible();
    expect(screen.queryByTestId("contractor-card")).not.toBeInTheDocument();
  });

  it("shows the data-quality note for an imputed price", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("Категория подрядчика"), "Флорист");
    await submit(user);

    expect(await screen.findByTestId("price-imputed-note")).toHaveTextContent("Стартовая цена восстановлена из данных");
  });
});
