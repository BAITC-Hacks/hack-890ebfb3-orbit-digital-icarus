import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { applyTheme, storedTheme, THEME_STORAGE_KEY, themeColors } from "./theme";

// Read the real palette: Vitest disables stylesheet transformation in component tests.
const css = readFileSync("src/styles/app.css", "utf8");

afterEach(() => { vi.restoreAllMocks(); document.documentElement.removeAttribute("data-theme"); });

describe("persistent theme preference", () => {
  it("prefers an explicit saved choice to the operating system", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(storedTheme()).toBe("light");
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(storedTheme()).toBe("dark");
  });

  it("falls back to the system when the saved value is absent or invalid", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(storedTheme()).toBe("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "invalid");
    expect(storedTheme()).toBe("dark");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    expect(storedTheme()).toBe("light");
    vi.stubGlobal("matchMedia", undefined);
    expect(storedTheme()).toBe("light");
  });

  it("still reads the system and applies a theme when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(storedTheme()).toBe("dark");
    expect(() => applyTheme("light")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("updates the root, browser chrome and stored preference together", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    try {
      for (const theme of ["dark", "light"] as const) {
        applyTheme(theme);
        expect(document.documentElement.dataset.theme).toBe(theme);
        expect(meta.content).toBe(themeColors[theme]);
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);
      }
    } finally { meta.remove(); }
  });
});

function luminance(hex: string): number {
  const values = hex.match(/[0-9a-f]{2}/gi)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
const contrast = (foreground: string, background: string) => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
};

describe.each(["light", "dark"] as const)("%s palette contrast", theme => {
  const selector = theme === "light" ? ":root" : ':root[data-theme="dark"]';
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(([, name, value]) => [name, value]));

  it("keeps card, evidence, category hints and snapshot text at 4.5:1 or higher", () => {
    for (const background of ["background", "surface", "surface-soft"]) {
      for (const foreground of ["ink", "muted", "sage", "accent"]) {
        expect(contrast(tokens[foreground], tokens[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const [foreground, background] of [["on-accent", "accent"], ["on-accent", "accent-hover"], ["on-sage", "sage"], ["error", "error-surface"], ["note", "note-surface"], ["note", "surface"]]) {
      expect(contrast(tokens[foreground], tokens[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps control boundaries distinguishable from their surface", () => {
    for (const surface of ["background", "surface"]) expect(contrast(tokens["control-line"], tokens[surface])).toBeGreaterThanOrEqual(3);
  });
});
