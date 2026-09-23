import type { MatchRequest, MatchResponse, MetadataResponse } from "./types";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail: unknown) {
    super(status === 422 ? "Проверьте параметры запроса." : "Сервис временно недоступен. Попробуйте ещё раз.");
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export const getMetadata = () => request<MetadataResponse>("metadata");

export const matchContractors = (payload: MatchRequest, signal?: AbortSignal) =>
  request<MatchResponse>("match", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
