import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { getUser } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

it("a downgrade is scheduled for the renewal date, not applied now", async () => {
  renderAt("/subscription");
  fireEvent.click(await screen.findByRole("button", { name: /Downgrade/ }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("radio")[0]!);
  fireEvent.click(screen.getByRole("button", { name: /Confirm downgrade/ }));
  await screen.findByText(/Switching to/);
  expect(getUser().subscription.plan).toBe("Premium");
  expect(getUser().subscription.pendingChange).toBeTruthy();
});
