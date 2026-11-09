import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

describe("banner preview", () => {
  beforeEach(() => resetAll("admin"));

  it("shows how a banner looks, in every design, without opening the editor", async () => {
    renderAt("/admin/banners");
    const previews = await screen.findAllByRole("button", { name: /^Preview /i });
    fireEvent.click(previews[0]!);
    const dialog = await screen.findByTestId("banner-preview");
    expect(within(dialog).getByText("How this banner looks")).toBeTruthy();
    const tabs = within(dialog).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/\(selected\)/, "").trim())).toEqual(["Hero", "Normal", "Latest Release", "Promotional"]);
    // the banner's own text is drawn by the real customer-site component
    const stage = within(dialog).getByTestId("banner-stage");
    expect(stage.querySelector("h1, h2, div")).toBeTruthy();
    for (const t of tabs) {
      fireEvent.click(t);
      expect(t.getAttribute("aria-selected")).toBe("true");
      expect(within(dialog).getByTestId("banner-stage").textContent?.length).toBeGreaterThan(0);
    }
  });

  it("the editor has a Preview button that uses what is typed before saving", async () => {
    renderAt("/admin/banners");
    fireEvent.click(await screen.findByRole("button", { name: /Add banner/i }));
    const editor = await screen.findByRole("dialog");
    fireEvent.change(within(editor).getByLabelText("Title"), { target: { value: "Weekend marathon" } });
    fireEvent.click(within(editor).getByRole("button", { name: /Preview/ }));
    const dialog = await screen.findByTestId("banner-preview");
    await waitFor(() => expect(within(dialog).getAllByText("Weekend marathon").length).toBeGreaterThan(0));
    // nothing was saved by previewing
    expect(screen.queryByText("Banner saved")).toBeNull();
  });

  it("clicking the button inside the preview does not leave the page", async () => {
    const { router } = renderAt("/admin/banners");
    fireEvent.click((await screen.findAllByRole("button", { name: /^Preview /i }))[0]!);
    const dialog = await screen.findByTestId("banner-preview");
    for (const a of within(dialog).queryAllByRole("link")) fireEvent.click(a);
    expect(router.state.location.pathname).toBe("/admin/banners");
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
