import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("the admin sets social links in Settings, and the footer shows an icon only for the ones set", async () => {
  const { router } = renderAt("/admin/settings");
  const panel = await screen.findByTestId("social-links");

  // a bad address is refused and nothing is saved
  fireEvent.change(within(panel).getByLabelText("YouTube link"), { target: { value: "youtube dot com" } });
  fireEvent.click(within(panel).getByRole("button", { name: "Save links" }));
  expect((await within(panel).findByRole("alert")).textContent).toMatch(/https/);

  fireEvent.change(within(panel).getByLabelText("YouTube link"), { target: { value: "https://www.youtube.com/@streamverse" } });
  fireEvent.change(within(panel).getByLabelText("Facebook link"), { target: { value: "https://facebook.com/streamverse" } });
  fireEvent.click(within(panel).getByRole("button", { name: "Save links" }));
  await waitFor(() => expect(within(panel).queryByRole("alert")).toBeNull());

  await router.navigate({ to: "/movies" });
  const footer = await waitFor(() => {
    const el = document.querySelector("footer");
    expect(el).toBeTruthy();
    return el as HTMLElement;
  });
  expect(within(footer).getByRole("link", { name: "YouTube" }).getAttribute("href")).toBe("https://www.youtube.com/@streamverse");
  expect(within(footer).getByRole("link", { name: "Facebook" }).getAttribute("href")).toBe("https://facebook.com/streamverse");
  expect(within(footer).queryByRole("link", { name: "Instagram" })).toBeNull();
  expect(within(footer).queryByRole("link", { name: "X" })).toBeNull();
});
