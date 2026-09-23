/**
 * Manually aligned with Instructions.md, API contract v1.
 * Replace with/reconcile against bbl's OpenAPI types once B1 is published.
 * These declarations are not generated from an API schema.
 */

export interface MatchRequest {
  city: string;
  event_date: string;
  event_format: string;
  category: string;
  budget_kzt: number;
  duration_hours?: number | null;
  language?: string | null;
}

export interface NormalizedMatchRequest extends MatchRequest {
  duration_hours: number | null;
  language: string | null;
}

export type MatchStatus =
  | "matches_found"
  | "category_absent"
  | "no_eligible_contractors";

export type EvidenceCode =
  | "availability"
  | "budget"
  | "format"
  | "language"
  | "duration"
  | "description";

export type EvidenceScalar = string | number | boolean | null;

export interface EvidenceItem {
  code: EvidenceCode;
  field: string;
  value: EvidenceScalar | EvidenceScalar[];
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

export interface MatchCounts {
  city_category_total: number;
  eligible_total: number;
  returned_total: number;
}

export interface ExclusionCounts {
  booked: number;
  over_budget: number;
  unsupported_format: number;
  unsupported_language: number;
  duration_exceeded: number;
}

export interface MatchResponse {
  schema_version: "1";
  status: MatchStatus;
  request: NormalizedMatchRequest;
  dataset_version: string;
  algorithm_version: string;
  message: string;
  counts: MatchCounts;
  exclusions: ExclusionCounts;
  /** Server ranking order; the client must not sort or pad these cards. */
  cards: MatchCard[];
}

export interface DemoPreset {
  id: string;
  label: string;
  request: MatchRequest;
}

/** Metadata field names are provisional until the B1 OpenAPI schema lands. */
export interface MetadataResponse {
  cities: string[];
  categories: string[];
  event_formats: string[];
  languages: string[];
  date_min: string;
  date_max: string;
  demo_presets?: DemoPreset[];
}

/** Health field names are provisional until the B1 OpenAPI schema lands. */
export interface HealthResponse {
  status: "ok";
  profile_count: number;
  dataset_version: string;
  algorithm_version: string;
}
