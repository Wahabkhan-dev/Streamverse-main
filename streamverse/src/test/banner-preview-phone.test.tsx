import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("the Phone view shows the real site in a phone-wide frame", async () => {
  renderAt("/admin/banners");
  fireEvent.click((await screen.findAllByRole("button", { name: /^Preview / }))[0]!);
  const dialog = await screen.findByTestId("banner-preview");
  expect(within(dialog).queryByTestId("banner-phone")).toBeNull();
  fireEvent.click(within(dialog).getByRole("tab", { name: "Phone" }));
  const frame = within(dialog).getByTitle("Banner on a phone");
  expect(frame.getAttribute("src")).toBe("/banner-frame");
  expect(frame.getAttribute("width")).toBe("390");
  fireEvent.click(within(dialog).getByRole("tab", { name: "Desktop" }));
  await waitFor(() => expect(within(dialog).getByTestId("banner-stage")).toBeTruthy());
});
