import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// the suite runs many heavy files in parallel; give async lookups room so a slow machine is not mistaken for a bug
configure({ asyncUtilTimeout: 8000 });

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
