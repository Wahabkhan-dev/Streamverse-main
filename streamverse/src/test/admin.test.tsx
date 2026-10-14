import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveDraft } from "@/lib/drafts";
import { update } from "@/lib/store";
import { updateUser } from "@/lib/user";
import { file, next, pick, renderAt, resetAll, setVal, uploadFile, uploadImage } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

const savedStore = () => JSON.parse(localStorage.getItem("sv-store-v2") ?? "{}");
const savedDrafts = (): { id: string; title: string }[] => {
  const raw = JSON.parse(localStorage.getItem("sv-drafts-v1") ?? "[]");
  return Array.isArray(raw) ? raw : (raw.drafts ?? []);
};
const uploaded = (slot: string) => waitFor(() => expect(document.getElementById(`f-${slot}`)?.textContent).toMatch(/Processing|Ready/));
const settle = (ms = 1900) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function open(path: string) {
  const r = renderAt(path);
  await screen.findByLabelText(path.includes("/movies/") ? "Movie Title" : "Title");
  return r;
}

async function movieStep1() {
  setVal("Movie Title", "Test Voyage");
  setVal("Short Description", "A short pitch");
  setVal("Full Description / Synopsis", "A longer synopsis");
  setVal("Release Date", "2026-05-01");
  setVal("Runtime", "128");
  await pick("Country of Origin", "United States");
  fireEvent.change(screen.getByLabelText("Primary Genre"), { target: { value: "Drama" } });
}

const adminPages = [
  ["/admin/dashboard", "Welcome back, Sam."],
  ["/admin/movies", "Movies"],
  ["/admin/ebooks", "eBooks"],
  ["/admin/audiobooks", "Audiobooks"],
  ["/admin/genres", "Genres & categories"],
  ["/admin/collections", "Collections"],
  ["/admin/homepage", "Homepage"],
  ["/admin/banners", "Banners"],
  ["/admin/users", "Users"],
  ["/admin/subscriptions", "Subscriptions"],
  ["/admin/payments", "Payments"],
  ["/admin/analytics", "Analytics"],
  ["/admin/notifications", "Notifications"],
  ["/admin/settings", "Settings"],
] as const;

describe("admin console", () => {
  it.each(adminPages)("renders %s", async (path, heading) => {
    renderAt(path);
    await waitFor(() => expect(screen.getAllByRole("heading", { name: heading }).length).toBeGreaterThan(0));
  });

  it("redirects /admin to the dashboard", async () => {
    renderAt("/admin");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Welcome back, Sam." })).toBeTruthy());
  });

  it("a customer is turned away from the admin area", async () => {
    resetAll("user");
    renderAt("/admin/dashboard");
    expect(await screen.findByText("Admin access required")).toBeTruthy();
  });

  it.each([
    ["/admin/movies/crimson-horizon/edit", "Edit Crimson Horizon"],
    ["/admin/ebooks/the-quiet-tide/edit", "Edit The Quiet Tide"],
    ["/admin/audiobooks/echoes-of-mars/edit", "Edit Echoes of Mars"],
  ])("opens the edit wizard at %s", async (path, heading) => {
    renderAt(path);
    await waitFor(() => expect(screen.getByRole("heading", { name: heading })).toBeTruthy());
  });

  it("admin search opens a title's editor", async () => {
    renderAt("/admin/dashboard");
    const box = await screen.findByLabelText("Search the admin console");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "crimson" } });
    fireEvent.click(await screen.findByRole("option", { name: /Crimson Horizon/ }));
    expect(await screen.findByRole("heading", { name: "Edit Crimson Horizon" })).toBeTruthy();
  });
});

describe("catalog lists: filters match their columns", () => {
  const rows = () => screen.getAllByRole("row").slice(1);
  const titles = () => rows().map((r) => within(r).getAllByRole("cell")[0]!.textContent ?? "");

  it("movies: age rating options come from the data", async () => {
    renderAt("/admin/movies");
    const sel = (await screen.findByLabelText("Age rating")) as HTMLSelectElement;
    const options = [...sel.options].map((o) => o.value).filter(Boolean);
    expect(options.length).toBeGreaterThan(0);
    fireEvent.change(sel, { target: { value: options[0] } });
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().length).toBeLessThan(10);
  });

  it("search narrows the list and Clear filters restores it", async () => {
    renderAt("/admin/movies");
    const box = await screen.findByPlaceholderText(/Search movies/);
    const all = rows().length;
    fireEvent.change(box, { target: { value: "ember" } });
    await waitFor(() => expect(rows().length).toBeLessThan(all));
    fireEvent.change(box, { target: { value: "zzzzqq" } });
    expect(await screen.findByText(/No movies match/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Reset filters|Clear filters/ })[0]!);
    await waitFor(() => expect(rows().length).toBe(all));
  });

  it("columns can be sorted", async () => {
    renderAt("/admin/movies");
    const sort = await screen.findByRole("button", { name: /Sort by Title/ });
    fireEvent.click(sort);
    const first = titles();
    expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b)));
    fireEvent.click(sort);
    expect(titles()).toEqual([...first].sort((a, b) => b.localeCompare(a)));
  });

  it("eBooks and audiobooks have their own column filters", async () => {
    const e = renderAt("/admin/ebooks");
    expect(await screen.findByLabelText("Author")).toBeTruthy();
    e.unmount();
    renderAt("/admin/audiobooks");
    expect(await screen.findByLabelText("Duration")).toBeTruthy();
  });

  it("unpublish and publish change the title's status", async () => {
    renderAt("/admin/movies");
    fireEvent.click(await screen.findByRole("button", { name: /Unpublish Glass Quiet/ }));
    await waitFor(() => expect(savedStore().movies.find((m: { slug: string }) => m.slug === "glass-quiet").status).toBe("Unpublished"));
    fireEvent.click(await screen.findByRole("button", { name: /^Publish Glass Quiet/ }));
    await waitFor(() => expect(savedStore().movies.find((m: { slug: string }) => m.slug === "glass-quiet").status).toBe("Published"));
  });
});

describe("per-title statistics", () => {
  it("published titles link to their stats; drafts can't", async () => {
    renderAt("/admin/movies");
    expect(await screen.findByRole("link", { name: /stats for Crimson Horizon/i })).toBeTruthy();
    const off = screen.getAllByRole("button", { name: /available once it is published/i });
    expect((off[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["/admin/movies/crimson-horizon/stats", "Crimson Horizon"],
    ["/admin/ebooks/the-quiet-tide/stats", "The Quiet Tide"],
    ["/admin/audiobooks/echoes-of-mars/stats", "Echoes of Mars"],
  ])("renders %s", async (path, title) => {
    renderAt(path);
    expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("an unpublished title has no statistics yet", async () => {
    renderAt("/admin/movies/white-silence/stats");
    expect(await screen.findByText("No statistics yet")).toBeTruthy();
  });
});

describe("settings", () => {
  it("every setting either works or says it needs the backend", async () => {
    renderAt("/admin/settings");
    await screen.findByRole("heading", { name: "Settings" });
    expect(screen.getAllByText("Backend integration required").length).toBeGreaterThan(0);
    expect(screen.getByRole("switch", { name: "Maintenance mode" })).toBeTruthy();
  });

  it("a failed save shows a visible error", async () => {
    renderAt("/admin/settings");
    const toggle = await screen.findByRole("switch", { name: "Maintenance mode" });
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    fireEvent.click(toggle);
    expect(await screen.findByText("Unable to save your changes locally.")).toBeTruthy();
    spy.mockRestore();
  });

  it("maintenance mode replaces the customer site", async () => {
    act(() => update((s) => ({ settings: { ...s.settings, maintenance: true } })));
    act(() => updateUser((s) => ({ ...s, role: "user" })));
    renderAt("/movies");
    await waitFor(() => expect(screen.getByText(/right back/i)).toBeTruthy());
  });
});

describe("publishing wizard", () => {
  const stepNames = (nav: HTMLElement) => within(nav).getAllByRole("button").map((b) => b.textContent ?? "");

  it("movie 8 steps, eBook 6, audiobook 7", async () => {
    const m = renderAt("/admin/movies/new");
    expect(stepNames(await screen.findByRole("navigation", { name: "Publishing steps" }))).toHaveLength(8);
    expect(screen.getByRole("button", { name: /Save as Draft/ })).toBeTruthy();
    m.unmount();
    const b = renderAt("/admin/ebooks/new");
    expect(stepNames(await screen.findByRole("navigation", { name: "Publishing steps" }))).toHaveLength(6);
    b.unmount();
    renderAt("/admin/audiobooks/new");
    expect(stepNames(await screen.findByRole("navigation", { name: "Publishing steps" }))).toHaveLength(7);
  });

  it("blocks Next with 'This field is required.' and keeps what was typed", async () => {
    await open("/admin/movies/new");
    setVal("Movie Title", "Half Done");
    next();
    await waitFor(() => expect(screen.getAllByText("This field is required.").length).toBeGreaterThanOrEqual(3));
    expect((screen.getByLabelText("Movie Title") as HTMLInputElement).value).toBe("Half Done");
  });

  it("keeps data when moving back and forward", async () => {
    await open("/admin/movies/new");
    await movieStep1();
    next();
    await screen.findByLabelText("Primary Language");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByLabelText("Movie Title");
    expect((screen.getByLabelText("Movie Title") as HTMLInputElement).value).toBe("Test Voyage");
  });

  it("movie: completes every step, publishes with promotion flags, and is live on the site", async () => {
    const admin = await open("/admin/movies/new");
    await movieStep1();
    next();
    await pick("Primary Language", "English");
    next();
    await screen.findByLabelText("Main Movie File file");
    uploadFile("Main Movie File", file("movie.mp4"));
    await uploaded("main");
    next();
    await screen.findByLabelText("Official Trailer file");
    uploadFile("Official Trailer", file("trailer.mp4"));
    await uploaded("trailer");
    next();
    await screen.findByLabelText("Poster image");
    for (const l of ["Poster", "Backdrop", "Thumbnail"]) {
      uploadImage(l);
      await screen.findByAltText(l);
    }
    next();
    await screen.findByLabelText("Cinematographer");
    next();
    await waitFor(() => expect(screen.queryByLabelText("Age Rating")).toBeTruthy(), { timeout: 3000 }).catch(() => {
      throw new Error("stuck before restrictions: " + [...document.querySelectorAll("[role=alert],.text-destructive,.text-primary-bright")].map((e) => e.textContent).join(" | ").slice(0, 600));
    });
    fireEvent.change(screen.getByLabelText("Age Rating"), { target: { value: "PG-13" } });
    next();
    await screen.findByText("Required details", {}, { timeout: 4000 }).catch(() => {
      throw new Error("not on publish: " + (document.querySelector("main")?.textContent ?? "").slice(0, 900));
    });
    fireEvent.click(screen.getByRole("switch", { name: "Featured" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish movie" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Movies" })).toBeTruthy());
    const saved = savedStore().movies.find((m: { slug: string }) => m.slug === "test-voyage");
    expect(saved.status).toBe("Published");
    expect(saved.promo.featured).toBe(true);
    admin.unmount();
    expect(savedDrafts()).toHaveLength(0);
    act(() => updateUser((s) => ({ ...s, role: "user" })));
    renderAt("/movies/test-voyage");
    await waitFor(() => expect(screen.getAllByText("Test Voyage").length).toBeGreaterThan(0));
  }, 60000);

  it("scheduling keeps the release date and records when it goes live", async () => {
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    const before = savedStore().movies?.find?.((m: { slug: string }) => m.slug === "crimson-horizon")?.release;
    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));
    await screen.findByText("Required details");
    fireEvent.click(screen.getByRole("radio", { name: /Schedule/ }));
    setVal("Publish Date", "2099-03-05");
    setVal("Publish Time", "18:30");
    expect(await screen.findByText(/Scheduled for:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Schedule publishing/ }));
    await waitFor(() => expect(savedStore().movies.find((m: { slug: string }) => m.slug === "crimson-horizon").status).toBe("Scheduled"));
    const movie = savedStore().movies.find((m: { slug: string }) => m.slug === "crimson-horizon");
    expect(movie.publishAt).toBe("2099-03-05T18:30");
    if (before) expect(movie.release).toBe(before);
  });

  it("Save as Draft keeps a title off the customer catalog", async () => {
    const admin = await open("/admin/ebooks/new");
    setVal("Title", "Hidden Draft");
    fireEvent.click(screen.getByRole("button", { name: /Save as Draft/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "eBooks" })).toBeTruthy());
    admin.unmount();
    act(() => updateUser((s) => ({ ...s, role: "user" })));
    renderAt("/ebooks");
    await screen.findAllByRole("heading", { name: "eBooks" });
    expect(screen.queryAllByText("Hidden Draft").length).toBe(0);
  });
});

describe("drafts, autosave and recovery", () => {
  it("autosaves a new title as a draft with a Last Saved time", async () => {
    await open("/admin/movies/new");
    setVal("Movie Title", "The Last Horizon");
    expect(screen.getByRole("status").textContent).toMatch(/Unsaved Changes/);
    await settle();
    expect(screen.getByRole("status").textContent).toMatch(/Saved locally/);
    expect(screen.getByText(/Last Saved:/)).toBeTruthy();
    expect(savedDrafts().map((d) => d.title)).toEqual(["The Last Horizon"]);
  });

  it("several drafts: Add New asks before touching any; Start New leaves them alone", async () => {
    saveDraft("d1", "Movie", "The Last Horizon", { d: { title: "The Last Horizon" }, media: {}, images: {} } as never);
    saveDraft("d2", "Movie", "Silent Earth", { d: { title: "Silent Earth" }, media: {}, images: {} } as never);
    saveDraft("d3", "eBook", "Other Type", { d: { title: "Other Type" }, media: {}, images: {} } as never);
    renderAt("/admin/movies/new");
    expect(await screen.findByText(/unfinished drafts/i)).toBeTruthy();
    expect(screen.getByText("Silent Earth")).toBeTruthy();
    expect(screen.queryByText("Other Type")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Continue Draft/i })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Start New/i }));
    await waitFor(() => expect((screen.getByLabelText("Movie Title") as HTMLInputElement).value).toBe(""));
    expect(savedDrafts()).toHaveLength(3);
  });

  it("edit mode autosaves locally and restores after a reload", async () => {
    const first = renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    setVal("Movie Title", "Crimson Horizon II");
    await settle();
    expect(screen.getByRole("status").textContent).toMatch(/Saved locally/);
    first.unmount();
    renderAt("/admin/movies/crimson-horizon/edit");
    expect(await screen.findByText(/Restored your unsaved edits/i)).toBeTruthy();
    expect((screen.getByLabelText("Movie Title") as HTMLInputElement).value).toBe("Crimson Horizon II");
    fireEvent.click(screen.getByRole("button", { name: /Discard/i }));
    await waitFor(() => expect((screen.getByLabelText("Movie Title") as HTMLInputElement).value).toBe("Crimson Horizon"));
  });
});
