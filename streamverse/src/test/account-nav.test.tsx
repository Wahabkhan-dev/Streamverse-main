import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ACCOUNT_LINKS, isAccountPath } from "@/components/sv/AccountNav";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

it("knows which addresses are account pages", () => {
  for (const l of ACCOUNT_LINKS) expect(isAccountPath(l.to)).toBe(true);
  expect(isAccountPath("/profile/")).toBe(true);
  expect(isAccountPath("/movies")).toBe(false);
  expect(isAccountPath("/")).toBe(false);
  expect(isAccountPath("/profiles-of-actors")).toBe(false);
});

it("every account page shows the tabs, marks where you are, and moves you between pages without the account menu", async () => {
  const { router } = renderAt("/profile");
  const nav = await screen.findByRole("navigation", { name: "Your account" });
  const links = within(nav).getAllByRole("link");
  expect(links.map((l) => l.textContent?.trim())).toEqual(ACCOUNT_LINKS.map((l) => l.label));
  expect(within(nav).getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBe("page");

  fireEvent.click(within(nav).getByRole("link", { name: "Subscription" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/subscription"));
  const nav2 = await screen.findByRole("navigation", { name: "Your account" });
  await waitFor(() => expect(within(nav2).getByRole("link", { name: "Subscription" }).getAttribute("aria-current")).toBe("page"));
  expect(within(nav2).getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBeNull();

  fireEvent.click(within(nav2).getByRole("link", { name: "Downloads" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/downloads"));
  expect(await screen.findByRole("navigation", { name: "Your account" })).toBeTruthy();
});

it("pages that are not account pages do not get the tabs", async () => {
  renderAt("/movies");
  await screen.findByRole("navigation", { name: "Main" });
  expect(screen.queryByRole("navigation", { name: "Your account" })).toBeNull();
});
