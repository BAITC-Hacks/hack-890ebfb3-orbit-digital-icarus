import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { previewMatch } from "../api/demo";
import { ContactPanel, buildInquiry } from "./ContactPanel";

// Fixture profiles isolate inquiry behavior; full matching is covered against the real API.
const request = { city: "Алматы", event_date: "2026-10-10", event_format: "свадьба", category: "Флорист", budget_kzt: 300000, duration_hours: 6.5, language: "русский" };
async function fixture() { return (await previewMatch(request)).cards[0]; }

describe("honest inquiry preparation", () => {
  it("includes the returned contractor and every requested condition without claiming a reservation", async () => {
    const card = await fixture();
    const draft = buildInquiry(card, request, "en");
    for (const value of [card.id, card.anon_name, "Florist", "Almaty", "10.10.2026", "Wedding", "300,000", "6.5", "Russian", "not a booking"]) expect(draft).toContain(value);
    expect(draft).not.toMatch(/mailto:|tel:|wa\.me/); // No contacts exist in the supplied schema.
  });

  it("copies only after a click and reports copying, never delivery", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const card = await fixture();
    const { rerender } = render(<ContactPanel card={card} request={request} locale="en" />);
    await user.click(screen.getByText("Contact / prepare inquiry"));
    expect(screen.getByText(/contains no verified phone numbers/)).toBeVisible();
    expect(write).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy inquiry" }));
    expect(write).toHaveBeenCalledWith(buildInquiry(card, request, "en"));
    expect(screen.getByRole("status")).toHaveTextContent("Copied. No message was sent.");
    rerender(<ContactPanel card={card} request={request} locale="ru" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement(); // A new language is not yet copied.
    write.mockRestore();
  });

  it("offers selected text when clipboard permission is denied", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<ContactPanel card={await fixture()} request={request} locale="en" />);
    fireEvent.click(screen.getByText("Contact / prepare inquiry"));
    await user.click(screen.getByRole("button", { name: "Copy inquiry" }));
    expect(screen.getByRole("status")).toHaveTextContent("copy it manually");
    const draft = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(draft).toHaveFocus();
    expect(draft.selectionEnd - draft.selectionStart).toBe(draft.value.length);
    write.mockRestore();
  });
});
