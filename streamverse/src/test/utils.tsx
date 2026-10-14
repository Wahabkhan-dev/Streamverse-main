import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { sim } from "@/components/sv/wizard/kit";
import { resetDrafts } from "@/lib/drafts";
import { resetLegal } from "@/lib/legal";
import { routeTree } from "@/routeTree.gen";
import { resetStore } from "@/lib/store";
import { resetUser, setRole } from "@/lib/user";

// jsdom has no ResizeObserver (charts, the wizard stage) and never decodes images
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
class FakeImage {
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  naturalWidth = 4000;
  naturalHeight = 4000;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}
vi.stubGlobal("Image", FakeImage);
// jsdom doesn't implement scrolling or fullscreen
Element.prototype.scrollIntoView ??= () => undefined;
window.scrollTo = () => undefined;

export function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

/** Fresh catalog, fresh customer, no drafts, uploads that finish in a tick. Admin by default so every route is reachable. */
export function resetAll(role: "user" | "admin" = "admin") {
  localStorage.clear();
  resetStore();
  resetUser();
  resetDrafts();
  resetLegal();
  setRole(role);
  sim.factor = 1000;
  sim.probeMs = 0;
}

export const setVal = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
export const pick = async (label: string, option: string) => {
  fireEvent.focus(screen.getByLabelText(label));
  fireEvent.mouseDown(await screen.findByRole("option", { name: option }));
};
export const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
export const file = (name: string, body = "x") => new File([body], name, { type: "application/octet-stream" });
export const uploadFile = (label: string, f: File) => fireEvent.change(screen.getByLabelText(`${label} file`), { target: { files: [f] } });
export const uploadImage = (label: string) => fireEvent.change(screen.getByLabelText(`${label} image`), { target: { files: [new File(["img"], "art.jpg", { type: "image/jpeg" })] } });
