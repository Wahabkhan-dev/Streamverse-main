import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

it("a user's detail dialog shows their account tabs", async () => {
  renderAt("/admin/users");
  fireEvent.click(await screen.findByRole("button", { name: "View Priya Shah" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  await waitFor(() => expect(screen.getAllByText(/Subscription|Activity|Overview/).length).toBeGreaterThan(0));
});
