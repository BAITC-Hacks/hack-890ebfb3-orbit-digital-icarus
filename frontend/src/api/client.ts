import type {
  EvidenceItem,
  HealthResponse,
  MatchAlternative,
  MatchCard,
  MatchRequest,
  MatchResponse,
  MetadataResponse,
  NormalizedMatchRequest,
} from "./types";

export type * from "./types";

export interface RequestOptions {
  /** API server origin/prefix, without /api. Omit for same-origin requests. */
  baseUrl?: string;
  /** Abort the previous request when the form changes or a new search starts. */
  signal?: AbortSignal;
  /** Deadline for both the response headers and body; defaults to 10 seconds. */
  timeoutMs?: number;
}

export interface ValidationError {
  field: string | null;
  message: string;
  type?: string;
}

/** An HTTP failure. Network failures and AbortError retain their original type. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  readonly validationErrors: ValidationError[];
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, detail: unknown) {
    const validationErrors = parseValidationErrors(detail);
    const message =
      status === 422
        ? "Проверьте параметры запроса."
        : status >= 500
          ? "Сервис временно недоступен. Попробуйте ещё раз."
          : `Не удалось выполнить запрос (HTTP ${status}).`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.validationErrors = validationErrors;
    this.fieldErrors = {};
    for (const error of validationErrors) {
      if (error.field !== null) {
        // Defining own properties avoids inherited keys such as "constructor".
        const messages = Object.hasOwn(this.fieldErrors, error.field)
          ? this.fieldErrors[error.field]
          : [];
        Object.defineProperty(this.fieldErrors, error.field, {
          value: [...messages, error.message],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
  }
}

/** An HTTP success with an invalid response must be rendered as a service error. */
export class ApiResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Сервис вернул некорректный ответ. Попробуйте ещё раз.");
    this.name = "ApiResponseError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isMatchRequest(value: unknown): value is MatchRequest {
  if (!isRecord(value)) return false;
  return isText(value.city)
    && isDateString(value.event_date)
    && isText(value.event_format)
    && isText(value.category)
    && isCount(value.budget_kzt) && value.budget_kzt > 0
    && (value.duration_hours === undefined || value.duration_hours === null || isPositiveNumber(value.duration_hours))
    && (value.language === undefined || value.language === null || isText(value.language));
}

function isNormalizedRequest(value: unknown): value is NormalizedMatchRequest {
  return isMatchRequest(value) && value.duration_hours !== undefined && value.language !== undefined;
}

function isEvidenceScalar(value: unknown): boolean {
  return value === null || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  if (!isRecord(value)) return false;
  return isText(value.code)
    && ["availability", "budget", "format", "language", "duration", "description"].includes(value.code)
    && isText(value.field)
    && (Array.isArray(value.value)
      ? value.value.every((item) => typeof item === "string")
      : isEvidenceScalar(value.value))
    && (value.source_quote === null || typeof value.source_quote === "string");
}

function isMatchCard(value: unknown): value is MatchCard {
  if (!isRecord(value)) return false;
  return isText(value.id)
    && isText(value.anon_name)
    && isText(value.category)
    && isStringList(value.categories)
    && isText(value.city)
    && isCount(value.price_from_kzt) && value.price_from_kzt > 0
    && isDateString(value.event_date)
    && value.availability === "free_in_dataset"
    && typeof value.synthetic === "boolean"
    && (value.source_kind === "provided" || value.source_kind === "team_added")
    && typeof value.city_imputed === "boolean"
    && typeof value.price_imputed === "boolean"
    && isText(value.explanation)
    && Array.isArray(value.evidence) && value.evidence.every(isEvidenceItem);
}

function isMatchAlternative(value: unknown, original: NormalizedMatchRequest): value is MatchAlternative {
  if (!isRecord(value) || !isNormalizedRequest(value.request)) return false;
  if (!isText(value.changed_field) || !["city", "event_date", "budget_kzt"].includes(value.changed_field)) return false;
  if (!isCount(value.eligible_total) || value.eligible_total === 0) return false;
  const request = value.request;
  const fields: (keyof NormalizedMatchRequest)[] = [
    "city", "event_date", "event_format", "category", "budget_kzt", "duration_hours", "language",
  ];
  const changed = fields.filter((field) => request[field] !== original[field]);
  return changed.length === 1 && changed[0] === value.changed_field
    && (value.changed_field !== "budget_kzt" || request.budget_kzt > original.budget_kzt);
}

function isMatchResponse(value: unknown): value is MatchResponse {
  if (!isRecord(value) || !isRecord(value.counts) || !isRecord(value.exclusions)) return false;
  if (value.schema_version !== "1" || !isText(value.status) || !["matches_found", "category_absent", "no_eligible_contractors"].includes(value.status)) return false;
  if (!isNormalizedRequest(value.request) || !isText(value.dataset_version) || !isText(value.algorithm_version) || !isText(value.message)) return false;
  if (!Array.isArray(value.cards) || value.cards.length > 3 || !value.cards.every(isMatchCard)) return false;

  const { city_category_total, eligible_total, returned_total } = value.counts;
  if (!isCount(city_category_total) || !isCount(eligible_total) || !isCount(returned_total)) return false;
  if (returned_total !== value.cards.length || returned_total !== Math.min(3, eligible_total) || eligible_total > city_category_total) return false;
  const request = value.request;
  if (value.alternatives !== undefined) {
    if (!Array.isArray(value.alternatives) || value.alternatives.length > 3
      || (value.status === "matches_found" && value.alternatives.length > 0)
      || !value.alternatives.every((alternative) => isMatchAlternative(alternative, request))) return false;
  }
  if (!value.cards.every((card) => card.city === request.city
    && card.event_date === request.event_date
    && card.category === request.category
    && card.categories.includes(request.category)
    && card.price_from_kzt <= request.budget_kzt)) return false;
  if (new Set(value.cards.map((card) => card.id)).size !== value.cards.length) return false;
  if (value.status === "matches_found" ? value.cards.length === 0 : value.cards.length !== 0 || eligible_total !== 0) return false;
  if (value.status === "category_absent" && city_category_total !== 0) return false;
  if (value.status === "no_eligible_contractors" && city_category_total === 0) return false;
  const exclusions = value.exclusions;
  const exclusionCounts = ["booked", "over_budget", "unsupported_format", "unsupported_language", "duration_exceeded"]
    .map((key) => exclusions[key]);
  if (!exclusionCounts.every(isCount)) return false;
  return exclusionCounts.reduce((total, count) => total + count, 0) === city_category_total - eligible_total;
}

function isMetadataResponse(value: unknown): value is MetadataResponse {
  if (!isRecord(value)) return false;
  if (!isStringList(value.cities) || !isStringList(value.categories) || !isStringList(value.event_formats) || !isStringList(value.languages)) return false;
  return isDateString(value.calendar_start) && isDateString(value.calendar_end);
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return isRecord(value) && value.status === "ready" && isCount(value.profile_count)
    && isText(value.dataset_version) && isText(value.algorithm_version);
}

function parseValidationErrors(detail: unknown): ValidationError[] {
  if (!Array.isArray(detail)) return [];
  return detail.flatMap((item: unknown): ValidationError[] => {
    if (!isRecord(item) || typeof item.msg !== "string") return [];
    const location = Array.isArray(item.loc)
      ? item.loc.filter(
          (part: unknown): part is string | number =>
            typeof part === "string" || typeof part === "number",
        )
      : [];
    if (["body", "query", "path"].includes(String(location[0]))) {
      location.shift();
    }
    return [
      {
        field: location.length ? location.join(".") : null,
        message: item.msg,
        ...(typeof item.type === "string" ? { type: item.type } : {}),
      },
    ];
  });
}

async function requestJson<T>(
  path: string,
  options: RequestOptions,
  validate: (value: unknown) => value is T,
  request?: NormalizedMatchRequest,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError("timeoutMs must be a positive, finite timer duration.");
  }
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  let rejectCancellation!: (reason: unknown) => void;
  const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  const cancel = (reason: unknown) => {
    rejectCancellation(reason);
    controller.abort(reason);
  };
  const callerAbort = () => cancel(options.signal?.reason ?? new DOMException("The request was aborted.", "AbortError"));
  options.signal?.addEventListener("abort", callerAbort, { once: true });
  const timer = setTimeout(() => {
    cancel(new DOMException(`The request timed out after ${timeoutMs} ms.`, "TimeoutError"));
  }, timeoutMs);

  const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
  try {
    const operation = async (): Promise<T> => {
      const response = await fetch(`${baseUrl}/api/${path}`, {
        method: request === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...(request === undefined ? {} : { "Content-Type": "application/json" }),
        },
        signal: controller.signal,
        ...(request === undefined ? {} : { body: JSON.stringify(request) }),
      });

      const body = await response.text();
      let parsed: unknown;
      let isJson = false;
      try {
        parsed = JSON.parse(body) as unknown;
        isJson = true;
      } catch {
        // Proxy HTML and plain-text errors are never shown as page content.
      }

      if (!response.ok) {
        throw new ApiError(
          response.status,
          isRecord(parsed) && "detail" in parsed ? parsed.detail : undefined,
        );
      }
      if (!isJson || !validate(parsed)) {
        throw new ApiResponseError(response.status);
      }
      return parsed;
    };
    // The race also settles callers when a transport ignores cancellation.
    return await Promise.race([operation(), cancellation]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", callerAbort);
  }
}

/** Server owns normalization, filtering and card order; transport preserves it. */
export function matchContractors(
  request: MatchRequest,
  options: RequestOptions = {},
): Promise<MatchResponse> {
  const payload: NormalizedMatchRequest = {
    city: request.city,
    event_date: request.event_date,
    event_format: request.event_format,
    category: request.category,
    budget_kzt: request.budget_kzt,
    duration_hours: request.duration_hours ?? null,
    language: request.language ?? null,
  };
  return requestJson("match", options, isMatchResponse, payload);
}

export function getMetadata(options: RequestOptions = {}): Promise<MetadataResponse> {
  return requestJson("metadata", options, isMetadataResponse);
}

export function getHealth(options: RequestOptions = {}): Promise<HealthResponse> {
  return requestJson("health", options, isHealthResponse);
}
