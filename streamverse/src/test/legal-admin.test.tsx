import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLegal, publishLegal, saveLegalDraft, sanitizeHtml, validateLegal, editingVersion } from "@/lib/legal";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll());
afterEach(() => cleanup());

const rec = () => getLegal()["refund-policy"];

describe("legal draft vs published", () => {
  it("a saved draft does not change the customer page; publishing does", async () => {
    const v = editingVersion(rec());
    act(() => {
      saveLegalDraft("refund-policy", { ...v, version: "1.1", html: "<h2>Brand new heading</h2><p>Draft only text.</p>" });
    });
    expect(rec().draft?.version).toBe("1.1");
    expect(rec().published?.version).toBe("1.0");
    const page = renderAt("/refund-policy");
    await screen.findByRole("heading", { level: 1, name: "Refund Policy" });
    expect(document.body.textContent).not.toContain("Draft only text.");
    page.unmount();

    act(() => {
      expect(publishLegal("refund-policy", rec().draft!)).toEqual([]);
    });
    expect(rec().draft).toBeNull();
    renderAt("/refund-policy");
    await screen.findByText("Draft only text.");
    expect(screen.getByText(/Version 1.1/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Brand new heading" })).toBeTruthy();
  });

  it("refuses to publish an empty or badly versioned document", () => {
    const v = editingVersion(rec());
    expect(validateLegal({ ...v, html: "<p> </p>" }).map((p) => p.field)).toContain("html");
    expect(validateLegal({ ...v, version: "one" }).map((p) => p.field)).toContain("version");
    expect(publishLegal("refund-policy", { ...v, title: "" })).not.toEqual([]);
    expect(rec().published?.title).toBe("Refund Policy");
  });

  it("strips scripts, handlers and unsafe links", () => {
    const out = sanitizeHtml('<p onclick="x()">a<script>alert(1)</script><a href="javascript:alert(1)">b</a><img src=x onerror=y></p>');
    expect(out).not.toMatch(/script|onclick|javascript:|<img/i);
    expect(out).toContain("a");
  });
});

describe("canonical routes", () => {
  it.each([
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms & Conditions"],
  ])("old alias %s still lands on the document", async (path, title) => {
    renderAt(path);
    await screen.findByRole("heading", { level: 1, name: title });
  });
});

describe("admin Legal & Policies", () => {
  it("shows the three tabs, saves a draft, then publishes it to customers", { timeout: 30000 }, async () => {
    renderAt("/admin/legal");
    await screen.findByRole("heading", { level: 1, name: "Legal & Policies" });
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["PRIVACY POLICY", "TERMS & CONDITIONS", "REFUND POLICY"]);
    fireEvent.click(screen.getByRole("tab", { name: "REFUND POLICY" }));
    expect(((await screen.findByLabelText(/^Slug/)) as HTMLInputElement).value).toBe("refund-policy");
    expect(screen.getByRole("toolbar", { name: /formatting/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Refund Policy text" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Version/), { target: { value: "1.2" } });
    fireEvent.click(screen.getByRole("button", { name: /SAVE DRAFT/ }));
    await waitFor(() => expect(rec().draft?.version).toBe("1.2"));
    expect(rec().published?.version).toBe("1.0");

    fireEvent.click(screen.getByRole("button", { name: /PREVIEW/ }));
    expect(await screen.findByText(/Preview — as customers will see it/)).toBeTruthy();
    expect(screen.getByText(/Version 1.2/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /PUBLISH/ }));
    await waitFor(() => expect(rec().published?.version).toBe("1.2"));
    expect(rec().draft).toBeNull();
  });

  it("blocks Publish with a visible error when the version is invalid", async () => {
    renderAt("/admin/legal");
    await screen.findByRole("heading", { level: 1, name: "Legal & Policies" });
    fireEvent.change(screen.getByLabelText(/^Version/), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /PUBLISH/ }));
    const alert = await screen.findByText("Use a version like 1.2.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(getLegal()["privacy-policy"].published?.version).toBe("1.0");
    expect(within(document.body).getAllByRole("tab")).toHaveLength(3);
  });

  it("lists Legal & Policies in the sidebar just before Settings", async () => {
    renderAt("/admin/legal");
    await screen.findByRole("heading", { level: 1, name: "Legal & Policies" });
    const labels = [...document.querySelectorAll("aside a, nav a")].map((a) => a.textContent?.trim());
    const i = labels.indexOf("Legal & Policies");
    expect(i).toBeGreaterThan(-1);
    expect(labels[i + 1]).toBe("Settings");
  });
});
