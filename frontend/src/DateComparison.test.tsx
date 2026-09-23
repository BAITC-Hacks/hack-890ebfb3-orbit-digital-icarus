import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateComparison } from "./DateComparison";
import { getDateInsights, onlyDateChanged, type DateComparisonPair } from "./dateInsights";
import { metadata, previewMatch } from "./api/demo";
import { getMetadata, matchContractors } from "./api/client";

// Exercise the production orchestration with explicit HTTP fixtures, without the real network.
vi.hoisted(() => vi.stubEnv("VITE_API_MODE", "api"));
vi.mock("./api/client", async importOriginal => ({
  ...await importOriginal<typeof import("./api/client")>(), getMetadata: vi.fn(), matchContractors: vi.fn(),
}));
vi.mock("./community/CommunityPage", () => ({ CommunityPage: () => null }));

async function fixture(): Promise<DateComparisonPair> {
  const request = { city: "Алматы", event_date: "2026-10-10", event_format: "свадьба", category: "Ведущий", budget_kzt: 3_000_000 };
  const previous = await previewMatch(request);
  const current = await previewMatch({ ...request, event_date: "2026-10-11" });
  current.cards = [current.cards[2], { ...current.cards[0], id: "HK-NEW", anon_name: "New profile" }];
  current.counts.returned_total = current.cards.length;
  return { previous, current };
}

function payload(pair: DateComparisonPair) {
  return {
    previous_date: pair.previous.request.event_date, current_date: pair.current.request.event_date,
    dataset_version: pair.current.dataset_version, algorithm_version: pair.current.algorithm_version,
    previous_ids: pair.previous.cards.map(card => card.id), current_ids: pair.current.cards.map(card => card.id),
    removed: [
      { id: pair.previous.cards[0].id, name: pair.previous.cards[0].anon_name, reason: "booked" },
      { id: pair.previous.cards[1].id, name: pair.previous.cards[1].anon_name, reason: "out_ranked" },
    ], added: ["HK-NEW"],
  };
}
const response = (value: unknown) => ({ ok: true, json: async () => value }) as Response;

beforeEach(() => {
  vi.mocked(getMetadata).mockResolvedValue(metadata);
  vi.mocked(matchContractors).mockReset();
  window.history.replaceState(null, "", "/#/match");
});

describe("grounded date comparison", () => {
  it("uses server reasons, distinguishing booked from still eligible, in both languages", async () => {
    const pair = await fixture();
    const fetch = vi.fn().mockResolvedValue(response(payload(pair)));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<DateComparison comparison={pair} locale="en" />);
    expect(await screen.findByText(/booked on the new date in the supplied calendar/)).toBeVisible();
    expect(screen.getByText(/still eligible; other eligible profiles ranked higher/)).toHaveAttribute("data-reason", "out_ranked");
    expect(screen.getByText(/New profile/)).toBeVisible();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ previous: pair.previous.request, current: pair.current.request });
    rerender(<DateComparison comparison={pair} locale="ru" />);
    expect(screen.getByText(/по-прежнему подходит/)).toBeVisible();
    expect(screen.getByText(/занят на новую дату/)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["dataset", "algorithm", "ids", "date", "reason", "missing removal"])("rejects mismatched %s rather than attaching false reasons", async kind => {
    const pair = await fixture();
    const body = payload(pair);
    if (kind === "dataset") body.dataset_version = "newer";
    if (kind === "algorithm") body.algorithm_version = "newer";
    if (kind === "ids") body.current_ids = ["unrelated"];
    if (kind === "date") body.current_date = "2026-12-31";
    if (kind === "reason") body.removed[0].reason = "unknown";
    if (kind === "missing removal") body.removed = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(getDateInsights(pair, new AbortController().signal)).rejects.toThrow();
  });

  it("compares only a date change, normalizing absent optional fields", async () => {
    const { previous, current } = await fixture();
    expect(onlyDateChanged(previous.request, current.request)).toBe(true);
    expect(onlyDateChanged(previous.request, { ...current.request, duration_hours: undefined, language: undefined })).toBe(true);
    for (const change of [
      { event_date: previous.request.event_date }, { city: "Астана" }, { budget_kzt: 4_000_000 },
      { category: "Флорист" }, { event_format: "той" }, { language: "русский" }, { duration_hours: 4 },
    ]) expect(onlyDateChanged(previous.request, { ...current.request, ...change })).toBe(false);
  });

  it("ignores an obsolete response even when fetch does not honor its aborted signal", async () => {
    const pair = await fixture();
    const newer = { previous: pair.previous, current: { ...pair.current, request: { ...pair.current.request, event_date: "2026-10-12" } } };
    let resolveOld!: (value: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response(payload(newer)));
    vi.stubGlobal("fetch", fetch);
    const view = render(<DateComparison comparison={pair} locale="en" />);
    view.rerender(<DateComparison comparison={newer} locale="en" />);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await screen.findByText(/booked on the new date/);
    await act(async () => resolveOld(response({ ...payload(pair), removed: [] })));
    expect(screen.getByText(/10.10.2026 → 12.10.2026/)).toBeVisible();
    expect(screen.getByText(/booked on the new date/)).toBeVisible();
    view.unmount();
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });
});

describe("matching keeps a successful comparison baseline", () => {
  it("compares after date edits and clears the panel immediately on further editing", async () => {
    const { default: App } = await import("./App");
    const pair = await fixture();
    const fetch = vi.fn().mockResolvedValue(response(payload(pair)));
    vi.stubGlobal("fetch", fetch);
    vi.mocked(matchContractors).mockResolvedValueOnce(pair.previous).mockResolvedValueOnce(pair.current);
    const user = userEvent.setup();
    render(<App />);
    const submit = await screen.findByRole("button", { name: "Подобрать подрядчика" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-10" } });
    await user.click(submit);
    await screen.findByTestId("result-summary");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-11" } });
    expect(screen.queryByTestId("date-comparison")).not.toBeInTheDocument();
    await user.click(submit);
    expect(await screen.findByText(/по-прежнему подходит/)).toBeVisible();
    expect(screen.getAllByTestId("contractor-card").map(card => card.dataset.contractorId)).toEqual(pair.current.cards.map(card => card.id));
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-12" } });
    expect(screen.queryByTestId("date-comparison")).not.toBeInTheDocument();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("preserves successful results when the auxiliary request fails", async () => {
    const { default: App } = await import("./App");
    const pair = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.mocked(matchContractors).mockResolvedValueOnce(pair.previous).mockResolvedValueOnce(pair.current);
    const user = userEvent.setup();
    render(<App />);
    const submit = await screen.findByRole("button", { name: "Подобрать подрядчика" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-10" } });
    await user.click(submit);
    await screen.findByTestId("result-summary");
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-11" } });
    await user.click(submit);
    expect(await screen.findByText(/Не удалось проверить причины/)).toBeVisible();
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("contractor-card")).toHaveLength(2);
  });

  it("keeps the previous successful baseline through a failed search", async () => {
    const { default: App } = await import("./App");
    const pair = await fixture();
    pair.current.request.event_date = "2026-10-12";
    const fetch = vi.fn().mockResolvedValue(response(payload(pair)));
    vi.stubGlobal("fetch", fetch);
    vi.mocked(matchContractors).mockResolvedValueOnce(pair.previous).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(pair.current);
    const user = userEvent.setup();
    render(<App />);
    const submit = await screen.findByRole("button", { name: "Подобрать подрядчика" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-10" } });
    await user.click(submit);
    await screen.findByTestId("result-summary");
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-11" } });
    await user.click(submit);
    await screen.findByTestId("request-error");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-12" } });
    await user.click(submit);
    await screen.findByText(/по-прежнему подходит/);
    expect(JSON.parse(fetch.mock.calls[0][1].body).previous.event_date).toBe("2026-10-10");
    expect(screen.queryByTestId("request-error")).not.toBeInTheDocument();
  });

  it("does not request date insights when another matching condition changes", async () => {
    const { default: App } = await import("./App");
    const pair = await fixture();
    pair.current.request.budget_kzt = 4_000_000;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.mocked(matchContractors).mockResolvedValueOnce(pair.previous).mockResolvedValueOnce(pair.current);
    const user = userEvent.setup();
    render(<App />);
    const submit = await screen.findByRole("button", { name: "Подобрать подрядчика" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-10" } });
    await user.click(submit);
    await screen.findByTestId("result-summary");
    fireEvent.change(screen.getByLabelText("Дата мероприятия"), { target: { value: "2026-10-11" } });
    await user.clear(screen.getByLabelText("Бюджет, ₸"));
    await user.type(screen.getByLabelText("Бюджет, ₸"), "4 000 000");
    await user.click(submit);
    await screen.findByTestId("result-summary");
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("date-comparison")).not.toBeInTheDocument();
  });
});
