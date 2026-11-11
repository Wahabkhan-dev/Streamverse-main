import { expect, it } from "vitest";
import { demoModeFrom } from "@/lib/config";

it("a production build uses the real backend unless demo mode is asked for explicitly", () => {
  expect(demoModeFrom(undefined, true)).toBe(false); // forgotten variable in production: real data, never the demo
  expect(demoModeFrom("", true)).toBe(false);
  expect(demoModeFrom("false", true)).toBe(false);
  expect(demoModeFrom("true", true)).toBe(true); // an intentional demo deployment still works
});

it("development keeps demo mode as the default, and the variable still switches it", () => {
  expect(demoModeFrom(undefined, false)).toBe(true);
  expect(demoModeFrom("false", false)).toBe(false);
  expect(demoModeFrom("true", false)).toBe(true);
});
