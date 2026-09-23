/**
 * Keep these values as text drafts in controlled type="text" inputs. Use
 * inputMode="numeric" for budget and "decimal" for duration. Acceptance checks
 * apply to the complete proposed edit/paste: never strip invalid characters.
 * Parse only when validating/submitting; undefined means invalid, not omitted.
 * Reject invalid edits atomically and retain the previous draft. A rejected
 * nonblank paste should expose an error until corrected, especially when the
 * previous optional draft was empty. Only an intentionally empty duration is null.
 */

/** Digits and grouping spaces remain editable; submission validates grouping. */
export function acceptBudgetDraft(draft: string): boolean {
  return !/[^0-9 \u00a0\u202f]/.test(draft);
}

/** A single decimal separator is allowed while typing; no exponent or sign. */
export function acceptDurationDraft(draft: string): boolean {
  return !/[^0-9.,]/.test(draft) && (draft.match(/[.,]/g)?.length ?? 0) <= 1;
}

/** Whole positive KZT within the exact integer range used by the client. */
export function parseBudgetDraft(draft: string): number | undefined {
  if (!acceptBudgetDraft(draft)) return undefined;
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:[ \u00a0\u202f][0-9]{3})+)$/.test(draft)) return undefined;
  const value = Number(draft.replace(/[ \u00a0\u202f]/g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * Accept either decimal separator, including .5 / ,5. A trailing separator is
 * an unfinished draft, not a reason to silently submit the integer prefix.
 */
export function parseDurationDraft(draft: string): number | null | undefined {
  if (draft === "") return null;
  if (!acceptDurationDraft(draft) || draft.endsWith(".") || draft.endsWith(",")) return undefined;
  const value = Number(draft.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
