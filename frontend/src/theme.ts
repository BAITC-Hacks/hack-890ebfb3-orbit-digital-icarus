export type Theme = "light" | "dark";

// Keep Spectra's preference key so an existing choice survives the Tandau rename.
export const THEME_STORAGE_KEY = "contractor-match-theme";
export const themeColors: Record<Theme, string> = { light: "#faf8f2", dark: "#101815" };

export function storedTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Blocked storage must still allow the system preference. */ }
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch { return "light"; }
}

export function applyTheme(theme: Theme): void {
  // A single root attribute styles matching and community, including native controls.
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* The toggle works without persistence. */ }
}
