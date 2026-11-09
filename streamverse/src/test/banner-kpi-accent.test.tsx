import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACCENTS, accentGradient, applyAccent } from "@/lib/accent";
import { renderAt, resetAll } from "./utils";

afterEach(() => {
  cleanup();
  applyAccent(0);
});

describe("profile colour", () => {
  it("applyAccent swaps the theme's primary colour and the first colour puts the stylesheet's red back", () => {
    const root = document.documentElement;
    applyAccent(1);
    expect(root.style.getPropertyValue("--primary")).toBe(ACCENTS[1]!.primary);
    expect(root.style.getPropertyValue("--ring")).toBe(ACCENTS[1]!.primary);
    expect(root.dataset["accent"]).toBe("blue");
    applyAccent(0);
    expect(root.style.getPropertyValue("--primary")).toBe("");
    expect(root.style.getPropertyValue("--primary-text")).toBe("");
  });

  it("every colour is distinct, and an out-of-range index wraps instead of breaking", () => {
    expect(new Set(ACCENTS.map((a) => a.primary)).size).toBe(ACCENTS.length);
    expect(accentGradient(ACCENTS.length)).toBe(accentGradient(0));
    expect(() => applyAccent(-1)).not.toThrow();
  });

  it("choosing a colour on the Profile page recolours the whole app at once and keeps it", async () => {
    resetAll("user");
    renderAt("/profile");
    const green = await screen.findByRole("radio", { name: /Green/ });
    fireEvent.click(green);
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--primary")).toBe(ACCENTS[2]!.primary));
    expect(green.getAttribute("aria-checked")).toBe("true");
    // saved without pressing Save Changes
    expect(screen.getByText("All changes saved")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("sv-user-v1") ?? "{}").profile?.avatar).toBe(2);
  });
});

describe("dashboard numbers", () => {
  beforeEach(() => resetAll("admin"));

  it("a number is a button that takes the admin to the tab behind it", async () => {
    const { router } = renderAt("/admin/dashboard");
    fireEvent.click(await screen.findByRole("button", { name: /Total users/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/users"));
  });
});
