import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("the banner editor offers all four banner types and validates", async () => {
  renderAt("/admin/banners");
  fireEvent.click(await screen.findByRole("button", { name: /Add banner|New banner/i }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  for (const t of ["Promotional", "Normal", "Latest Release"]) expect(screen.getAllByText(new RegExp(t, "i")).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /^Save|Create/i }));
  expect((await screen.findAllByText(/required|Add a/i)).length).toBeGreaterThan(0);
});
