import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { getUser } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

it("the add-card dialog validates every field, ties errors to inputs, and saves only safe data", async () => {
  renderAt("/payment-methods");
  fireEvent.click(await screen.findByRole("button", { name: "Add payment method" }));
  const dlg = await screen.findByRole("dialog", { name: "Add payment method" });
  const q = within(dlg);

  // nothing is submitted silently
  fireEvent.click(q.getByRole("button", { name: "Add payment method" }));
  await waitFor(() => expect(q.getAllByRole("alert")).toHaveLength(6));
  const number = q.getByLabelText(/Card number/) as HTMLInputElement;
  expect(number.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(number.getAttribute("aria-describedby")!)?.textContent).toMatch(/card number/i);
  expect(getUser().paymentMethods).toHaveLength(2);

  // bad values, one by one
  fireEvent.change(q.getByLabelText("Name on card"), { target: { value: "Alex Morgan" } });
  fireEvent.change(number, { target: { value: "4242424242424241" } });
  fireEvent.change(q.getByLabelText("Expiry"), { target: { value: "0120" } });
  fireEvent.change(q.getByLabelText("CVC"), { target: { value: "12" } });
  await waitFor(() => expect(q.getByText("Enter a valid card number.")).toBeTruthy());
  expect(q.getByText("This card has expired.")).toBeTruthy();
  expect(q.getByText("Enter the 3 or 4 digit security code.")).toBeTruthy();
  expect(number.value).toBe("4242 4242 4242 4241");
  expect((q.getByLabelText("Expiry") as HTMLInputElement).value).toBe("01/20");

  // a good card, made the new default
  fireEvent.change(number, { target: { value: "5555555555554444" } });
  fireEvent.change(q.getByLabelText("Expiry"), { target: { value: "1230" } });
  fireEvent.change(q.getByLabelText("CVC"), { target: { value: "123" } });
  fireEvent.change(q.getByLabelText("Billing country"), { target: { value: "Canada" } });
  fireEvent.change(q.getByLabelText("ZIP / postal code"), { target: { value: "M5V 2T6" } });
  fireEvent.click(q.getByRole("checkbox", { name: "Set as default payment method" }));
  expect(q.getAllByRole("link", { name: /Terms & Conditions|Refund Policy|Privacy Policy/ })).toHaveLength(3);
  fireEvent.click(q.getByRole("button", { name: "Add payment method" }));

  await waitFor(() => expect(getUser().paymentMethods).toHaveLength(3));
  const saved = getUser().paymentMethods.find((c) => c.last4 === "4444")!;
  expect(saved).toMatchObject({ brand: "Mastercard", expMonth: 12, expYear: 2030, holderName: "Alex Morgan", country: "Canada", isDefault: true });
  expect(getUser().paymentMethods.filter((c) => c.isDefault)).toHaveLength(1);
  const raw = localStorage.getItem("sv-user-v1") ?? "";
  expect(raw).not.toMatch(/5555555555554444|5555 5555 5555 4444/);
  expect(raw).not.toContain('"cvc"');
});
