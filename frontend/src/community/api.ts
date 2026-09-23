import type { EventDetail, EventInput, Listing, ListingInput, Message, Slot, Templates, User } from "./types";

export class CommunityApiError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

export function isCommunityEndpointUnavailable(error: unknown): boolean {
  return error instanceof CommunityApiError && error.status === 404 && error.code === "endpoint_unavailable";
}

/** Cookie credentials stay in the browser; server details never become UI copy. */
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/community${path}`, {
      ...options, credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new CommunityApiError("network");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Framework route misses differ from the API's deliberate private-resource 404s.
    // Keep the HTTP status unchanged so existing access-revocation behavior still applies.
    const code = response.status === 404 && body?.detail === "Not Found" ? "endpoint_unavailable"
      : typeof body?.detail?.code === "string" ? body.detail.code : response.status === 422 ? "validation" : "unknown";
    throw new CommunityApiError(code, response.status);
  }
  if (body === null) throw new CommunityApiError("invalid_response");
  return body as T;
}

const id = encodeURIComponent;
const write = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(body), signal });
export const communityApi = {
  session: (signal?: AbortSignal) => request<{ user: User | null }>("/session", { signal }),
  templates: (signal?: AbortSignal) => request<Templates>("/templates", { signal }),
  register: (body: { username: string; password: string; display_name: string; role: User["role"] }, signal?: AbortSignal) => request<{ user: User }>("/register", write("POST", body, signal)),
  login: (body: { username: string; password: string }, signal?: AbortSignal) => request<{ user: User }>("/login", write("POST", body, signal)),
  logout: (signal?: AbortSignal) => request<{ ok: true }>("/logout", write("POST", {}, signal)),
  listings: (filters: { city?: string; category?: string; mine?: boolean } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (filters.city) query.set("city", filters.city);
    if (filters.category) query.set("category", filters.category);
    if (filters.mine) query.set("mine", "true");
    return request<{ listings: Listing[] }>(`/listings?${query}`, { signal });
  },
  saveListing: (body: ListingInput, listingId?: string, signal?: AbortSignal) => request<Listing>(listingId ? `/listings/${id(listingId)}` : "/listings", write(listingId ? "PUT" : "POST", body, signal)),
  events: (signal?: AbortSignal) => request<{ events: EventDetail[] }>("/events", { signal }),
  createEvent: (body: EventInput, signal?: AbortSignal) => request<EventDetail>("/events", write("POST", body, signal)),
  event: (eventId: string, signal?: AbortSignal) => request<EventDetail>(`/events/${id(eventId)}`, { signal }),
  plan: (eventId: string, version: number, slots: Slot[], signal?: AbortSignal) => request<EventDetail>(`/events/${id(eventId)}/plan`, write("PUT", { version, slots }, signal)),
  invite: (eventId: string, slot_id: string, listing_id: string, version: number, signal?: AbortSignal) => request<EventDetail>(`/events/${id(eventId)}/invitations`, write("POST", { slot_id, listing_id, version }, signal)),
  respond: (eventId: string, slotId: string, decision: "accepted" | "declined", version: number, signal?: AbortSignal) => request<EventDetail>(`/events/${id(eventId)}/invitations/${id(slotId)}/respond`, write("POST", { decision, version }, signal)),
  messages: (eventId: string, signal?: AbortSignal) => request<{ messages: Message[] }>(`/events/${id(eventId)}/messages`, { signal }),
  send: (eventId: string, text: string, signal?: AbortSignal) => request<{ message: Message }>(`/events/${id(eventId)}/messages`, write("POST", { text }, signal)),
};
