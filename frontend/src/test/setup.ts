import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Component fixture tests intentionally opt into the visibly labeled preview.
// Real API matching remains covered by the separate root Playwright suite.
vi.stubEnv("VITE_API_MODE", "demo");

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "ru";
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
