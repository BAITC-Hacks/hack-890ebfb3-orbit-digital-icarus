import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import App from "../App";

it("starts at home, explains limitations and opens a category without searching", async () => {
  window.history.replaceState(null, "", "/"); // Root is onboarding, not an order or chat screen.
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByTestId("home-page")).toBeVisible();
  expect(screen.queryByTestId("match-form")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ваше событие.");
  await user.click(await screen.findByRole("button", { name: /Флорист/ }));
  await waitFor(() => expect(screen.getByTestId("match-form")).toBeVisible());
  expect(screen.getByRole("combobox", { name: "Категория подрядчика" })).toHaveValue("Флорист");
  expect(screen.queryByTestId("result-summary")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled(); // Explicit preview mode, no hidden search from navigation.
});
