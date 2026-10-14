import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getUser } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

// jsdom cannot run Radix's focus trap together with real focus() calls (it hangs the worker), so focus is
// recorded instead of performed here. Real focus handling is checked in a browser.
it("removing a card asks first, names the card safely, and updates the list", async () => {
  const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
  renderAt("/payment-methods");
  fireEvent.click(await screen.findByRole("button", { name: "Remove Mastercard ending in 5521" }));
  const dlg = await screen.findByRole("alertdialog", { name: "Remove payment method?" });
  expect(dlg.textContent).toContain("Mastercard ending in 5521");
  expect(within(dlg).getByRole("button", { name: "Cancel" })).toBeTruthy();
  // nothing has been removed yet
  expect(getUser().paymentMethods).toHaveLength(2);
  fireEvent.click(within(dlg).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(getUser().paymentMethods.map((c) => c.last4)).toEqual(["4242"]));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.queryByText(/5521/)).toBeNull();
  // exactly one default is left, and no stale card remains
  expect(getUser().paymentMethods.filter((c) => c.isDefault)).toHaveLength(1);
  // the removed card's button is gone, so focus is sent to the list rather than lost
  expect(focus.mock.contexts.some((c) => c instanceof HTMLElement && c.getAttribute("aria-label") === "Saved payment methods")).toBe(true);
  focus.mockRestore();
});
