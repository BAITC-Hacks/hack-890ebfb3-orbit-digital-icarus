import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { communityApi, CommunityApiError } from "./api";
import { CommunityPage } from "./CommunityPage";
import { copy } from "./copy";
import { EventWorkspace } from "./EventWorkspace";
import { InvitationPanel } from "./Invitations";
import { PlanEditor } from "./PlanEditor";
import { CommunityContext, errorText } from "./shared";
import type { EventDetail, Listing, Templates, User } from "./types";
import { useEventDetail } from "./useEventDetail";

const provider: User = { id: "provider1", username: "florist", display_name: "Aida", role: "provider" };
const organizer: User = { id: "owner1", username: "planner", display_name: "Dana", role: "organizer" };
const templates: Templates = {
  cities: ["Алматы", "Астана", "Зарубежье"],
  services: [{ category: "Флорист", label: { ru: "Флорист", en: "Florist" }, checklist: { ru: ["Палитра"], en: ["Palette"] } }],
  events: [{ id: "custom", label: { ru: "Свой план", en: "Custom plan" }, services: [] }],
};
const listing: Listing = { id: "listing1", owner_id: provider.id, provider_name: provider.display_name, title: "Seasonal flowers", category: "Флорист", city: "Алматы", price_from_kzt: 150000, description: "Thoughtful flowers for your celebration.", active: true, created_at: "2026-09-23T12:00:00Z" };
const event: EventDetail = {
  id: "event1", owner_id: organizer.id, owner_name: organizer.display_name, title: "Autumn gathering", city: "Алматы", event_date: "2026-10-10", version: 1, created_at: "2026-09-23T12:00:00Z",
  slots: [{ id: "slot1", category: "Флорист", notes: "Warm autumn colors", checklist: [{ text: "Palette", done: false }] }],
  invitations: [{ slot_id: "slot1", listing_id: listing.id, user_id: provider.id, status: "invited", version: 1, provider_name: provider.display_name, listing_title: listing.title }],
  can_chat: false, team_ready: false, messages: [],
};

type Handler = (path: string, options: RequestInit) => unknown | Promise<unknown>;
function mockApi(handler?: Handler) {
  const mocked = vi.fn(async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const path = String(input).replace("/api/community", "");
    let body = await handler?.(path, options);
    if (body instanceof Response) return body;
    if (body === undefined) {
      if (path === "/session") body = { user: null };
      else if (path === "/templates") body = templates;
      else if (path.startsWith("/listings")) body = { listings: [] };
      else if (path === "/events") body = { events: [] };
      else if (path === "/events/event1") body = event;
      else if (path === "/logout") body = { ok: true };
      else if (path.split("?")[0] === "/api/catalog" && (!options.method || options.method === "GET")) {
        // Match the public catalog contract; explicit handler errors take precedence.
        body = { dataset_version: "test-catalog", calendar_start: "2026-10-10", calendar_end: "2026-10-11", profiles: [] };
      }
      else throw new Error(`Unexpected test request: ${path}`);
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", mocked);
  return mocked;
}

const context = (user: User = organizer) => ({ locale: "en" as const, user, expireSession: vi.fn() });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function selectCommunityTab(locale: "en" | "ru") {
  fireEvent.click(await screen.findByRole("button", { name: locale === "en" ? "Community listings" : "Объявления сообщества", exact: true }));
}

async function openListingForm() {
  const fetch = mockApi((path, options) => {
    if (path === "/session") return { user: provider };
    if (path === "/listings" && options.method === "POST") return listing;
  });
  render(<CommunityPage page="account" locale="en" />);
  const newListing = await screen.findByRole("button", { name: /New listing/ });
  await waitFor(() => expect(newListing).toBeEnabled());
  fireEvent.click(newListing);
  const form = screen.getByTestId("listing-form");
  fireEvent.change(within(form).getByLabelText("Service title"), { target: { value: listing.title } });
  fireEvent.change(within(form).getByLabelText(/^About this service/), { target: { value: listing.description } });
  return { fetch, form, price: within(form).getByLabelText<HTMLInputElement>(/^Starting price/) };
}

describe("community transport and public browsing", () => {
  it.each(["session", "templates", "listings"] as const)("shows a localized restart hint for a framework 404 from %s", async endpoint => {
    mockApi(path => path.split("?")[0] === `/${endpoint}` ? new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 }) : undefined);
    await expect(communityApi[endpoint]()).rejects.toMatchObject({ code: "endpoint_unavailable", status: 404 });
    const view = render(<CommunityPage page="providers" locale="en" />);
    await selectCommunityTab("en");
    expect(await screen.findByText(copy.en.endpointUnavailable)).toBeVisible();
    expect(screen.queryByText(copy.en.missingError)).not.toBeInTheDocument();
    view.rerender(<CommunityPage page="providers" locale="ru" />);
    await selectCommunityTab("ru");
    expect(await screen.findByText(copy.ru.endpointUnavailable)).toBeVisible();
    expect(screen.queryByText(copy.ru.missingError)).not.toBeInTheDocument();
  });

  it.each([
    [404, "event_not_found", "missingError"],
    [404, "listing_not_found", "missingError"],
    [404, "slot_not_found", "missingError"],
    [403, "owner_required", "ownerRequired"],
    [403, "invitation_required", "permissionError"],
  ] as const)("preserves structured %s %s errors", async (status, code, key) => {
    mockApi(() => new Response(JSON.stringify({ detail: { code } }), { status }));
    const error = await communityApi.event("private-id").catch(cause => cause);
    expect(error).toBeInstanceOf(CommunityApiError);
    expect(error).toMatchObject({ status, code });
    for (const locale of ["ru", "en"] as const) expect(errorText(error, locale)).toBe(copy[locale][key]);
  });

  it("does not relabel a plain 403 as an unavailable endpoint", async () => {
    mockApi(() => new Response(JSON.stringify({ detail: "Not Found" }), { status: 403 }));
    const error = await communityApi.event("private-id").catch(cause => cause);
    expect(error).toMatchObject({ status: 403, code: "unknown" });
    expect(errorText(error, "en")).toBe(copy.en.permissionError);
  });

  it.each([403, 404])("still removes private event data on a structured %s response", async status => {
    let denied = false;
    const code = status === 403 ? "invitation_required" : "event_not_found";
    mockApi(path => path === "/events/event1" ? denied
      ? new Response(JSON.stringify({ detail: { code } }), { status })
      : { ...event, can_chat: true, messages: [{ id: 1, event_id: event.id, user_id: provider.id, display_name: provider.display_name, text: "Private message", created_at: event.created_at }] }
      : undefined);
    const shared = context(provider);
    const { result } = renderHook(() => useEventDetail(event.id), { wrapper: ({ children }) => <CommunityContext.Provider value={shared}>{children}</CommunityContext.Provider> });
    await waitFor(() => expect(result.current.detail?.messages).toHaveLength(1));
    denied = true;
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.detail).toBeNull());
    expect(result.current.error).toMatchObject({ status, code });
    expect(shared.expireSession).not.toHaveBeenCalled();
  });

  it("sends JSON and same-origin cookies on logout", async () => {
    const fetch = mockApi();
    await communityApi.logout();
    expect(fetch).toHaveBeenCalledWith("/api/community/logout", expect.objectContaining({ method: "POST", body: "{}", credentials: "same-origin", headers: expect.objectContaining({ "Content-Type": "application/json" }) }));
  });

  it("maps backend errors without displaying server details", () => {
    expect(errorText(new CommunityApiError("username_taken", 409), "en")).toBe(copy.en.usernameTaken);
    expect(errorText(new CommunityApiError("listing_limit", 409), "ru")).toBe(copy.ru.listingLimit);
    expect(errorText(new CommunityApiError("listing_not_suitable", 422), "en")).toBe(copy.en.listingError);
    expect(errorText(new CommunityApiError("event_changed", 409), "en")).toBe(copy.en.conflictError);
    expect(errorText(new CommunityApiError("secret stack trace", 500), "ru")).toBe(copy.ru.genericError);
  });

  it("browses listings before the session check completes and filters canonically", async () => {
    const fetch = mockApi(path => {
      if (path === "/session") return new Promise(() => undefined);
      if (path.startsWith("/listings")) return { listings: [listing] };
    });
    render(<CommunityPage page="providers" locale="en" />);
    await selectCommunityTab("en");
    expect(await screen.findByTestId("community-listing")).toHaveTextContent("Seasonal flowers");
    expect(screen.getByText(copy.en.unverified)).toBeVisible();
    expect(screen.queryByTestId("auth-form")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Алматы" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("city=%D0%90%D0%BB%D0%BC%D0%B0%D1%82%D1%8B"), expect.anything()));
    expect(screen.getByRole("option", { name: "Almaty" })).toHaveValue("Алматы");
  });
});

describe("account and listing forms", () => {
  it("registers a chosen role without an email and retains credentials only in the request", async () => {
    const fetch = mockApi(path => path === "/register" ? { user: provider } : undefined);
    render(<CommunityPage page="account" locale="en" />);
    const form = await screen.findByTestId("auth-form");
    fireEvent.click(within(form).getByRole("radio", { name: /Service provider/ }));
    fireEvent.change(within(form).getByLabelText("Display name"), { target: { value: "Aida" } });
    fireEvent.change(within(form).getByLabelText(/^Username/), { target: { value: "florist" } });
    fireEvent.change(within(form).getByLabelText(/^Password/), { target: { value: "test-password-123" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("heading", { name: "Aida" })).toBeVisible();
    const request = fetch.mock.calls.find(([path]) => String(path).endsWith("/register"));
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ username: "florist", password: "test-password-123", display_name: "Aida", role: "provider" });
    expect(document.querySelector('input[type="email"]')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("rejects malformed price edits atomically, bounds prices, and submits grouping spaces", async () => {
    const { fetch, form, price } = await openListingForm();
    expect(price).toHaveAttribute("type", "text");
    expect(price).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(price, { target: { value: "150000" } });
    for (const invalid of ["1e3", "5cats", "+100", "1.5", "4\t000"]) {
      fireEvent.change(price, { target: { value: invalid } });
      expect(price).toHaveValue("150000");
      expect(price).toHaveAttribute("aria-invalid", "true");
      fireEvent.submit(form);
    }
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    fireEvent.change(price, { target: { value: "" } });
    fireEvent.change(price, { target: { value: "100000001" } });
    fireEvent.submit(form);
    expect(price).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(price, { target: { value: "150 000" } });
    fireEvent.submit(form);
    await screen.findByText(copy.en.listingSaved);
    const request = fetch.mock.calls.find(([path, options]) => String(path).endsWith("/listings") && options?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ price_from_kzt: 150000, active: true });
  });

  it("keeps sequential 4e2 rejected until deletion instead of submitting 42", async () => {
    const user = userEvent.setup();
    const { fetch, form, price } = await openListingForm();
    await user.type(price, "4e2");
    expect(price).toHaveValue("4");
    expect(price).toHaveAttribute("aria-invalid", "true");
    await user.tab();
    await user.click(price);
    await user.keyboard("3");
    expect(price).toHaveValue("4");
    fireEvent.submit(form);
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    await user.keyboard("{Backspace}150000");
    expect(price).toHaveValue("150000");
    expect(price).toHaveAttribute("aria-invalid", "false");
    fireEvent.submit(form);
    await screen.findByText(copy.en.listingSaved);
  });

  it("allows deliberate keyboard replacement after a rejected sequence", async () => {
    const user = userEvent.setup();
    const { price } = await openListingForm();
    await user.type(price, "4e2");
    price.setSelectionRange(0, price.value.length);
    await user.keyboard("250000");
    expect(price).toHaveValue("250000");
    expect(price).toHaveAttribute("aria-invalid", "false");
  });

  it("rejects malformed full and partial pastes, then accepts a valid grouped paste", async () => {
    const user = userEvent.setup();
    const { fetch, form, price } = await openListingForm();
    await user.type(price, "150000");
    for (const malformed of ["4e2", "4 00", "5cats", "1.5"]) {
      price.setSelectionRange(0, price.value.length);
      await user.paste(malformed);
      expect(price).toHaveValue("150000");
      expect(price).toHaveAttribute("aria-invalid", "true");
      fireEvent.submit(form);
    }
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    price.setSelectionRange(1, 2);
    await user.paste("e");
    expect(price).toHaveValue("150000");
    price.setSelectionRange(price.value.length, price.value.length);
    await user.keyboard("2");
    expect(price).toHaveValue("150000");
    price.setSelectionRange(0, price.value.length);
    await user.paste("150\u202f000");
    expect(price).toHaveValue("150\u202f000");
    expect(price).toHaveAttribute("aria-invalid", "false");
    fireEvent.submit(form);
    await screen.findByText(copy.en.listingSaved);
    const request = fetch.mock.calls.find(([path, options]) => String(path).endsWith("/listings") && options?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body)).price_from_kzt).toBe(150000);
  });

  it("guards mobile input without keydown and recognizes deletion and selected replacement", async () => {
    const { fetch, form, price } = await openListingForm();
    fireEvent.input(price, { target: { value: "4" }, inputType: "insertText", data: "4" });
    fireEvent.input(price, { target: { value: "4e" }, inputType: "insertText", data: "e" });
    fireEvent.input(price, { target: { value: "42" }, inputType: "insertText", data: "2" });
    expect(price).toHaveValue("4");
    expect(price).toHaveAttribute("aria-invalid", "true");
    fireEvent.submit(form);
    expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    fireEvent.input(price, { target: { value: "" }, inputType: "deleteContentBackward" });
    fireEvent.input(price, { target: { value: "4" }, inputType: "insertText", data: "4" });
    expect(price).toHaveAttribute("aria-invalid", "false");
    fireEvent.input(price, { target: { value: "4e" }, inputType: "insertText", data: "e" });
    price.focus();
    price.setSelectionRange(0, 1);
    fireEvent.select(price);
    fireEvent.input(price, { target: { value: "250000" }, inputType: "insertText", data: "250000" });
    expect(price).toHaveValue("250000");
    expect(price).toHaveAttribute("aria-invalid", "false");
  });

  it("accepts the next digit when a rejected edit retained an empty draft", async () => {
    const user = userEvent.setup();
    const { price } = await openListingForm();
    await user.type(price, "e");
    expect(price).toHaveValue("");
    expect(price).toHaveAttribute("aria-invalid", "true");
    await user.keyboard("2");
    expect(price).toHaveValue("2");
    expect(price).toHaveAttribute("aria-invalid", "false");
    await user.clear(price);
    fireEvent.input(price, { target: { value: "e" }, inputType: "insertText", data: "e" });
    fireEvent.input(price, { target: { value: "2" }, inputType: "insertText", data: "2" });
    expect(price).toHaveValue("2");
    expect(price).toHaveAttribute("aria-invalid", "false");
  });

  it("lets providers withdraw an existing listing with active=false", async () => {
    const fetch = mockApi((path, options) => {
      if (path === "/session") return { user: provider };
      if (path === "/listings?mine=true") return { listings: [listing] };
      if (path === "/listings/listing1" && options.method === "PUT") return { ...listing, active: false };
    });
    render(<CommunityPage page="account" locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const form = screen.getByTestId("listing-form");
    fireEvent.click(within(form).getByLabelText("Visible in the public directory"));
    fireEvent.submit(form);
    await screen.findByText(copy.en.listingSaved);
    const request = fetch.mock.calls.find(([path, options]) => String(path).endsWith("/listings/listing1") && options?.method === "PUT");
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ active: false });
  });

  it("clears private data immediately when logout is pending or fails", async () => {
    let failLogout: (value: unknown) => void = () => undefined;
    mockApi(path => {
      if (path === "/session") return { user: provider };
      if (path === "/listings?mine=true") return { listings: [listing] };
      if (path === "/logout") return new Promise((_, reject) => { failLogout = reject; });
    });
    render(<CommunityPage page="account" locale="en" />);
    await screen.findByTestId("community-listing");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByTestId("community-listing")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aida" })).not.toBeInTheDocument();
    await act(async () => failLogout(new Error("offline")));
    expect(await screen.findByText(copy.en.logoutError)).toBeVisible();
    expect(screen.queryByTestId("auth-form")).not.toBeInTheDocument();
  });

  it("rechecks session on view changes and discards previous private state", async () => {
    let currentUser: User | null = provider;
    const fetch = mockApi(path => path === "/session" ? { user: currentUser } : undefined);
    const view = render(<CommunityPage page="account" locale="en" />);
    await screen.findByRole("heading", { name: "Aida" });
    currentUser = null;
    view.rerender(<CommunityPage page="events" locale="en" />);
    expect(screen.queryByRole("heading", { name: "Aida" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: copy.en.gateTitle })).toBeVisible();
    expect(fetch.mock.calls.filter(([path]) => String(path).endsWith("/session"))).toHaveLength(2);
  });
});

describe("event consent, drafts and chat", () => {
  it("shows the revised offer price and safely rendered details before acceptance", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const original = { ...event, invitations: [{ ...event.invitations[0], price_from_kzt: 150000, listing_description: listing.description }] };
    const shared = context(provider);
    const view = render(<CommunityContext.Provider value={shared}><InvitationPanel event={original} slot={event.slots[0]} busy={false} onAction={onAction} /></CommunityContext.Provider>);
    expect(screen.getByText("From 150,000 ₸")).toBeVisible();
    const description = 'Revised setup at 14:00. <img src=x onerror="alert(1)">';
    const revised = { ...original, version: 2, invitations: [{ ...original.invitations[0], version: 2, price_from_kzt: 250000, listing_description: description }] };
    view.rerender(<CommunityContext.Provider value={shared}><InvitationPanel event={revised} slot={event.slots[0]} busy={false} onAction={onAction} /></CommunityContext.Provider>);
    expect(screen.queryByText("From 150,000 ₸")).not.toBeInTheDocument();
    expect(screen.getByText("From 250,000 ₸")).toBeVisible();
    await user.click(screen.getByText(copy.en.offerDetails));
    expect(screen.getByText(description)).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Accept this plan" })).toBeEnabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("preserves consent when only a checklist completion flag changes", () => {
    const onSave = vi.fn();
    render(<CommunityContext.Provider value={context()}><PlanEditor event={event} templates={templates} busy={false} onSave={onSave} onCancel={vi.fn()} /></CommunityContext.Provider>);
    fireEvent.click(screen.getByLabelText("Mark task complete 1.1"));
    expect(screen.getByText(copy.en.progressOnly)).toBeVisible();
    expect(screen.queryByText(copy.en.resetWarning)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("plan-save"));
    expect(onSave).toHaveBeenCalledWith([{ ...event.slots[0], checklist: [{ text: "Palette", done: true }] }], 1, false);
  });

  it("keeps unsaved scope changes when a newer plan arrives", () => {
    const onSave = vi.fn();
    const shared = context();
    const view = render(<CommunityContext.Provider value={shared}><PlanEditor event={event} templates={templates} busy={false} onSave={onSave} onCancel={vi.fn()} /></CommunityContext.Provider>);
    fireEvent.change(screen.getByLabelText("Service notes"), { target: { value: "My unsaved arrangements" } });
    expect(screen.getByText(copy.en.resetWarning)).toBeVisible();
    view.rerender(<CommunityContext.Provider value={shared}><PlanEditor event={{ ...event, version: 2, slots: [{ ...event.slots[0], notes: "Another tab" }] }} templates={templates} busy={false} onSave={onSave} onCancel={vi.fn()} /></CommunityContext.Provider>);
    expect(screen.getByLabelText("Service notes")).toHaveValue("My unsaved arrangements");
    expect(screen.getByText(copy.en.changedElsewhere)).toBeVisible();
    expect(screen.getByTestId("plan-save")).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("opens chat only after acceptance and clears it after leaving", async () => {
    const accepted: EventDetail = { ...event, can_chat: true, team_ready: true, invitations: [{ ...event.invitations[0], status: "accepted" }] };
    const text = '<img src=x onerror="alert(1)">';
    let currentEvent = event;
    mockApi((path, options) => {
      if (path === "/events/event1") return currentEvent;
      if (path.endsWith("/respond")) {
        const decision = JSON.parse(String(options.body)).decision;
        currentEvent = decision === "accepted" ? accepted : { ...event, invitations: [{ ...event.invitations[0], status: "declined" }] };
        return currentEvent;
      }
      if (path.endsWith("/messages")) return { message: { id: 1, event_id: event.id, user_id: provider.id, display_name: provider.display_name, text, created_at: "2026-09-23T12:00:00Z" } };
    });
    render(<CommunityContext.Provider value={context(provider)}><EventWorkspace eventId="event1" templates={templates} onBack={vi.fn()} /></CommunityContext.Provider>);
    expect(await screen.findByText(copy.en.chatLocked)).toBeVisible();
    expect(screen.queryByTestId("chat-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept this plan" }));
    const form = await screen.findByTestId("chat-form");
    expect(screen.getByText(copy.en.teamReady)).toBeVisible();
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: text } });
    fireEvent.submit(form);
    expect(await screen.findByTestId("chat-message")).toHaveTextContent(text);
    expect(document.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leave this plan" }));
    await waitFor(() => expect(screen.queryByTestId("chat-form")).not.toBeInTheDocument());
    expect(screen.queryByTestId("chat-message")).not.toBeInTheDocument();
    expect(screen.getByText(copy.en.teamPending)).toBeVisible();
  });
});
