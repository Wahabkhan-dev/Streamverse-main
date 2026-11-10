import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

it("the footer has the link columns and a newsletter sign-up that checks the address", async () => {
  renderAt("/movies");
  const footer = await waitFor(() => {
    const el = document.querySelector("footer");
    expect(el).toBeTruthy();
    return el as HTMLElement;
  });
  for (const name of ["Browse", "Account", "Legal"]) expect(within(footer).getByRole("navigation", { name })).toBeTruthy();
  expect(within(footer).getByText("Stay in the Loop")).toBeTruthy();

  const input = within(footer).getByLabelText("Email address");
  fireEvent.change(input, { target: { value: "not-an-email" } });
  fireEvent.click(within(footer).getByRole("button", { name: "Subscribe" }));
  expect((await within(footer).findByRole("alert")).textContent).toMatch(/valid email/i);

  fireEvent.change(input, { target: { value: "fan@example.com" } });
  fireEvent.click(within(footer).getByRole("button", { name: "Subscribe" }));
  expect((await within(footer).findByRole("status")).textContent).toMatch(/on the list/i);
});
