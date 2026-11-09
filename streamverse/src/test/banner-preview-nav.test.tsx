import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("clicking the button inside the preview does not leave the page", async () => {
  const { router } = renderAt("/admin/banners");
  fireEvent.click((await screen.findAllByRole("button", { name: /^Preview /i }))[0]!);
  const dialog = await screen.findByTestId("banner-preview");
  for (const a of within(dialog).queryAllByRole("link")) fireEvent.click(a);
  expect(router.state.location.pathname).toBe("/admin/banners");
});
