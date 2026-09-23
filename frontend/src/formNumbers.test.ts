import { describe, expect, it } from "vitest";
import openapi from "../../contracts/openapi.json";
import {
  acceptBudgetDraft, acceptDurationDraft, parseBudgetDraft, parseDurationDraft, MAX_DURATION_HOURS,
} from "./formNumbers";

describe("budget drafts", () => {
  it("permits clearing and decimal digits while preserving the entered draft", () => {
    for (const draft of ["", "0", "000", "300000", "00125"]) expect(acceptBudgetDraft(draft)).toBe(true);
    expect(parseBudgetDraft("00125")).toBe(125);
    expect(parseBudgetDraft("300000")).toBe(300000);
  });

  it("rejects whole malformed edits instead of removing characters", () => {
    for (const draft of ["4e", "4E2", "+4", "-4", "4.5", "4,5", "４", "4a", "NaN", "Infinity", "0x10", "4\n", "4\t000", "4\u2009000"]) {
      expect(acceptBudgetDraft(draft), draft).toBe(false);
      expect(parseBudgetDraft(draft), draft).toBeUndefined();
    }
  });

  it("accepts readable thousands groups but never silently repairs malformed grouping", () => {
    for (const space of [" ", "\u00a0", "\u202f"]) {
      const draft = `4${space}000${space}000`;
      expect(acceptBudgetDraft(draft)).toBe(true);
      expect(parseBudgetDraft(draft)).toBe(4_000_000);
      expect(parseBudgetDraft(`300${space}000`)).toBe(300_000);
      expect(parseBudgetDraft(`4${space}00${space}000`)).toBeUndefined();
    }
    for (const draft of [" ", " 4", "4 ", "4 00", "40 00 000", "4000 000", "4  000", "1 0000", "4 000 ", "000 000"]) {
      expect(acceptBudgetDraft(draft), "Grouping spaces remain editable").toBe(true);
      expect(parseBudgetDraft(draft), draft).toBeUndefined();
    }
  });

  it("requires a nonzero exact safe integer for submission", () => {
    for (const draft of ["", "0", "000", "9007199254740992", "9".repeat(400)]) expect(parseBudgetDraft(draft)).toBeUndefined();
    expect(parseBudgetDraft("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("duration drafts", () => {
  it("uses the same maximum as the published API contract", () => {
    const schema = openapi.components.schemas.MatchRequest.properties.duration_hours.anyOf.find(item => item.type === "number");
    expect(schema?.maximum).toBe(MAX_DURATION_HOURS);
  });

  it("accepts the 12-hour boundary but rejects larger durations without clamping", () => {
    for (const draft of ["12", "12.0", "12,0", "11.999"]) expect(parseDurationDraft(draft)).toBe(Number(draft.replace(",", ".")));
    for (const draft of ["12.0001", "12,5", "13", "4903", "99999"]) expect(parseDurationDraft(draft)).toBeUndefined();
  });

  it("keeps intermediate empty and decimal-separator drafts editable", () => {
    for (const draft of ["", ".", ",", "4.", "4,", "0", "0.", ".5", ",5", "4.5", "4,5"]) {
      expect(acceptDurationDraft(draft), draft).toBe(true);
    }
  });

  it("parses positive dot and comma decimals equally", () => {
    for (const [draft, value] of [["4", 4], ["4.5", 4.5], ["4,5", 4.5], ["1.25", 1.25], [".5", 0.5], [",5", 0.5], ["0004,50", 4.5], ["0.01", 0.01]] as const) {
      expect(parseDurationDraft(draft), draft).toBe(value);
    }
  });

  it("only treats an exactly empty duration as omitted", () => {
    expect(parseDurationDraft("")).toBeNull();
    for (const draft of [".", ",", "4.", "4,", " ", "\n", "0", "0.0", "0,0", "9".repeat(400), `0.${"0".repeat(400)}1`]) {
      expect(parseDurationDraft(draft), draft).toBeUndefined();
    }
  });

  it("rejects letters, signs, exponents, mixed separators and whitespace without sanitizing", () => {
    for (const draft of ["4e", "4e2", "4E2", "+4", "-4", "4..5", "4,,5", "4.5,6", "4,5.6", "4 5", "4.5h", "４.５", " 4.5", "4.5 ", "4\n", "NaN", "Infinity", "0x10"]) {
      expect(acceptDurationDraft(draft), draft).toBe(false);
      expect(parseDurationDraft(draft), draft).toBeUndefined();
    }
  });
});
