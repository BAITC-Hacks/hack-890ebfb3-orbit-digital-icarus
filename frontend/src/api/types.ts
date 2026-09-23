export type MatchStatus = "matches_found" | "category_absent" | "no_eligible_contractors";

export interface MatchRequest {
  city: string;
  event_date: string;
  event_format: string;
  category: string;
  budget_kzt: number;
  duration_hours: number | null;
  language: string | null;
}

export interface EvidenceItem {
  code: "availability" | "budget" | "format" | "language" | "duration" | "description";
  field: string;
  value: string | number | string[] | null;
  source_quote: string | null;
}

export interface MatchCard {
  id: string;
  anon_name: string;
  category: string;
  categories: string[];
  city: string;
  price_from_kzt: number;
  event_date: string;
  availability: "free_in_dataset";
  synthetic: boolean;
  source_kind: "provided" | "team_added";
  city_imputed: boolean;
  price_imputed: boolean;
  explanation: string;
  evidence: EvidenceItem[];
}

export interface MatchResponse {
  schema_version: "1";
  status: MatchStatus;
  request: MatchRequest;
  dataset_version: string;
  algorithm_version: string;
  message: string;
  counts: {
    city_category_total: number;
    eligible_total: number;
    returned_total: number;
  };
  exclusions: {
    booked: number;
    over_budget: number;
    unsupported_format: number;
    unsupported_language: number;
    duration_exceeded: number;
  };
  cards: MatchCard[];
}

export interface MetadataResponse {
  cities: string[];
  categories: string[];
  event_formats: string[];
  languages: string[];
  calendar_start: string;
  calendar_end: string;
}
