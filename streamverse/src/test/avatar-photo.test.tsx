import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { avatarFileProblem } from "@/lib/avatarImage";
import { renderAt, resetAll } from "./utils";

// jsdom has no canvas, so the resize step is stubbed; its job (crop and shrink) is exercised in the browser
vi.mock("@/lib/avatarImage", async (orig) => ({ ...(await orig<typeof import("@/lib/avatarImage")>()), photoToAvatar: vi.fn(async () => "data:image/jpeg;base64,AAAA") }));

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

it("only photos the browser can show are accepted, with a reason when not", () => {
  expect(avatarFileProblem({ name: "me.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
  expect(avatarFileProblem({ name: "me.WEBP", type: "", size: 1000 })).toBeNull();
  expect(avatarFileProblem({ name: "doc.pdf", type: "application/pdf", size: 1000 })).toMatch(/JPG, PNG or WebP/);
  expect(avatarFileProblem({ name: "big.png", type: "image/png", size: 9_000_000 })).toMatch(/8 MB/);
});

it("an uploaded photo replaces the initials, is kept, and can be removed", async () => {
  renderAt("/profile");
  const input = (await screen.findByLabelText("Profile photo file")) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "me.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(screen.getAllByAltText(/profile photo/i).length).toBeGreaterThan(0));
  expect(screen.getByText("All changes saved")).toBeTruthy();
  expect(JSON.parse(localStorage.getItem("sv-user-v1") ?? "{}").profile?.avatarImage).toBe("data:image/jpeg;base64,AAAA");

  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(screen.queryAllByAltText(/profile photo/i).length).toBe(0));
  expect(JSON.parse(localStorage.getItem("sv-user-v1") ?? "{}").profile?.avatarImage).toBeUndefined();
});

it("a file that is not a photo is refused and nothing changes", async () => {
  renderAt("/profile");
  const input = (await screen.findByLabelText("Profile photo file")) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] } });
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryAllByAltText(/profile photo/i).length).toBe(0);
});
