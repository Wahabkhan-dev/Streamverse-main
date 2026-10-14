import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usd } from "@/lib/analytics";
import { payments } from "@/lib/data";
import { renderAt, resetAll } from "./utils";

afterEach(() => cleanup());

describe("switches and filters have names", () => {
  beforeEach(() => resetAll("admin"));

  it("every homepage section switch is named after its section", async () => {
    renderAt("/admin/homepage");
    await screen.findByRole("heading", { name: "Homepage" });
    for (const t of ["Trending Movies", "Featured eBooks", "New Audiobooks"]) expect(screen.getByRole("switch", { name: `Enable ${t} section` })).toBeTruthy();
    for (const sw of screen.getAllByRole("switch")) expect(sw.getAttribute("aria-label") || sw.textContent?.trim()).toBeTruthy();
  });

  it("every banner and plan switch is named, and the status filters are labelled", async () => {
    const banners = renderAt("/admin/banners");
    await screen.findByRole("heading", { name: "Banners" });
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(0);
    for (const sw of switches) expect(sw.getAttribute("aria-label")).toMatch(/^Active — /);
    banners.unmount();
    const plans = renderAt("/admin/subscriptions");
    await screen.findByRole("heading", { name: "Subscriptions" });
    for (const sw of screen.getAllByRole("switch")) expect(sw.getAttribute("aria-label")).toMatch(/^Active — .+ plan$/);
    plans.unmount();
    const users = renderAt("/admin/users");
    expect(await screen.findByLabelText("User Status")).toBeTruthy();
    users.unmount();
    renderAt("/admin/payments");
    expect(await screen.findByLabelText("Payment Status")).toBeTruthy();
  });
});

describe("payments cards come from the rows", () => {
  beforeEach(() => resetAll("admin"));
  it("counts and revenue match the transaction list, and nothing is the old made-up figure", async () => {
    renderAt("/admin/payments");
    await screen.findByRole("heading", { name: "Payments" });
    const by = (s: string) => payments.filter((p) => p.status === s).length;
    const revenue = payments.filter((p) => p.status === "Succeeded").reduce((n, p) => n + p.amount, 0);
    // a card is a label with its value directly after it; other "Succeeded" text (filter, badges) is ignored
    const card = (label: string) => {
      const l = [...document.querySelectorAll("div.text-xs.text-muted-foreground")].find((e) => e.textContent === label);
      return l!.parentElement as HTMLElement;
    };
    expect(within(card("Total payments")).getByText(String(payments.length))).toBeTruthy();
    expect(within(card("Succeeded")).getByText(String(by("Succeeded")))).toBeTruthy();
    expect(within(card("Pending")).getByText(String(by("Pending")))).toBeTruthy();
    expect(within(card("Failed")).getByText(String(by("Failed")))).toBeTruthy();
    expect(within(card("Refunded")).getByText(String(by("Refunded")))).toBeTruthy();
    expect(within(card("Total revenue")).getByText(usd(revenue))).toBeTruthy();
    expect(screen.queryByText("124")).toBeNull();
    expect(screen.getByText(/calculated from the sample transactions/)).toBeTruthy();
  });
});

describe("landmarks and semantics", () => {
  beforeEach(() => resetAll("user"));
  it.each(["/read/the-quiet-tide", "/listen/echoes-of-mars", "/watch/crimson-horizon"])("%s has exactly one main landmark", async (path) => {
    renderAt(path);
    await waitFor(() => expect(screen.getAllByRole("main")).toHaveLength(1), { timeout: 8000 });
  });

  it("the two search forms on the results page have different names", async () => {
    renderAt("/search?q=glass");
    await screen.findByLabelText("Search all titles and people");
    const names = screen.getAllByRole("search").map((f) => f.getAttribute("aria-label"));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it("the unread dot is hidden from assistive tech and the state is stated in text", async () => {
    renderAt("/notifications");
    await screen.findByRole("heading", { name: "Notifications" });
    expect(document.querySelector('[aria-label="Unread"]')).toBeNull();
    expect(screen.getAllByText("Unread").length).toBeGreaterThan(0);
  });

  it("the logo link is named by its visible text", async () => {
    renderAt("/movies");
    await screen.findByRole("heading", { level: 1 });
    const logo = [...document.querySelectorAll("header a")].find((l) => l.getAttribute("href") === "/" && l.textContent?.includes("STREAM"))!;
    expect(logo).toBeTruthy();
    expect(logo.getAttribute("aria-label")).toBeNull();
    expect(logo.querySelector("[aria-hidden=true]")?.textContent).toBe("S");
  });
});

describe("tabs follow the keyboard pattern", () => {
  beforeEach(() => resetAll("user"));
  it("arrow keys, Home and End move between tabs and only the selected tab is a tab stop", async () => {
    renderAt("/my-library");
    const tabs = await screen.findAllByRole("tab");
    expect(tabs[0]!.getAttribute("tabindex")).toBe("0");
    expect(tabs[1]!.getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getAllByRole("tab")[1]!.getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[1]);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    await waitFor(() => expect(screen.getAllByRole("tab").at(-1)!.getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    await waitFor(() => expect(screen.getAllByRole("tab")[0]!.getAttribute("aria-selected")).toBe("true"));
  });
});

describe("dialogs return focus to what opened them", () => {
  // jsdom cannot run Radix's focus trap with a focused opener, so the real dialog is checked in a browser;
  // this covers the logic that remembers and restores the opener.
  it("remembers the focused element on open and refocuses it on close", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useRestoreFocus } = await import("@/components/ui/restore-focus");
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { result } = renderHook(() => useRestoreFocus({}));
    result.current.onOpenAutoFocus(new Event("focus", { cancelable: true }));
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    const close = new Event("focus", { cancelable: true });
    result.current.onCloseAutoFocus(close);
    expect(close.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(opener);
    // an opener that has since been removed is left alone
    const gone = document.createElement("button");
    document.body.append(gone);
    gone.focus();
    result.current.onOpenAutoFocus(new Event("focus", { cancelable: true }));
    gone.remove();
    const again = new Event("focus", { cancelable: true });
    result.current.onCloseAutoFocus(again);
    expect(again.defaultPrevented).toBe(false);
  });
});
