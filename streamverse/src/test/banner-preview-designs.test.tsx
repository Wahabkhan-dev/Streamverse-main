import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("shows how a banner looks, in every design, without opening the editor", async () => {
  renderAt("/admin/banners");
  const previews = await screen.findAllByRole("button", { name: /^Preview /i });
  fireEvent.click(previews[0]!);
  const dialog = await screen.findByTestId("banner-preview");
  expect(within(dialog).getByText("How this banner looks")).toBeTruthy();
  const tabs = within(dialog).getAllByRole("tab");
  expect(tabs.map((t) => t.textContent?.replace(/\(selected\)/, "").trim())).toEqual(["Hero", "Normal", "Latest Release", "Promotional"]);
  // the banner's own text is drawn by the real customer-site component
  const stage = within(dialog).getByTestId("banner-stage");
  expect(stage.querySelector("h1, h2, div")).toBeTruthy();
  for (const t of tabs) {
    fireEvent.click(t);
    expect(t.getAttribute("aria-selected")).toBe("true");
    expect(within(dialog).getByTestId("banner-stage").textContent?.length).toBeGreaterThan(0);
  }
});
