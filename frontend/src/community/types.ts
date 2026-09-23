export type Locale = "ru" | "en";
export type CommunityView = "providers" | "events" | "account";
export type User = { id: string; username: string; display_name: string; role: "organizer" | "provider" };
export type ListingInput = { title: string; category: string; city: string; price_from_kzt: number; description: string; active: boolean };
export type Listing = ListingInput & { id: string; owner_id: string; provider_name: string; created_at: string };
export type Templates = {
  services: { category: string; label: Record<Locale, string>; checklist: Record<Locale, string[]> }[];
  events: { id: string; label: Record<Locale, string>; services: string[] }[];
  cities: string[];
};
export type Slot = { id: string; category: string; notes: string; checklist: { text: string; done: boolean }[] };
export type Invitation = {
  slot_id: string; listing_id: string; user_id: string; status: "invited" | "accepted" | "declined";
  version: number; provider_name: string; listing_title: string;
  price_from_kzt?: number; listing_description?: string;
};
export type Message = { id: number; event_id: string; user_id: string; display_name: string; text: string; created_at: string };
export type EventDetail = {
  id: string; owner_id: string; owner_name: string; title: string; city: string; event_date: string;
  version: number; created_at: string; slots: Slot[]; invitations: Invitation[];
  team_ready: boolean; can_chat: boolean; messages: Message[];
};
export type EventInput = { title: string; city: string; event_date: string; template_id: string; locale: Locale };
