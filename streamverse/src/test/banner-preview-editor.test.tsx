import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("the editor has a Preview button that uses what is typed before saving", async () => {
  renderAt("/admin/banners");
  fireEvent.click(await screen.findByRole("button", { name: /Add banner/i }));
  const editor = await screen.findByRole("dialog");
  fireEvent.change(within(editor).getByLabelText(/^Title/), { target: { value: "Weekend marathon" } });
  fireEvent.click(within(editor).getByRole("button", { name: /Preview/ }));
  const dialog = await screen.findByTestId("banner-preview");
  await waitFor(() => expect(within(dialog).getAllByText("Weekend marathon").length).toBeGreaterThan(0));
  // nothing was saved by previewing
  expect(screen.queryByText("Banner saved")).toBeNull();
});
