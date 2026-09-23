import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.stubEnv("VITE_API_MODE", "demo");
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
