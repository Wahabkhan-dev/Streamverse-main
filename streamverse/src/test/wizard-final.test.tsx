import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveDraft, deleteDraft } from "@/lib/drafts";
import { reserveContentId, update } from "@/lib/store";
import { getUser, toggleMyList, updateUser } from "@/lib/user";
import { file, next, renderAt, resetAll, setVal, uploadFile, uploadImage } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

const store = () => JSON.parse(localStorage.getItem("sv-store-v2") ?? "{}");
const uploaded = (slot: string) => waitFor(() => expect(document.getElementById(`f-${slot}`)?.textContent).toMatch(/Processing|Ready/));
const val = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const today = () => new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const openDetails = (title: string) => [...document.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent?.includes(title)) as HTMLDetailsElement | undefined;

/** a complete eBook snapshot, so an edit-mode draft can be restored straight onto the Restrictions step */
const readyEbook = (d: Record<string, unknown>) => ({
  d: { title: "The Quiet Tide", author: "Elena Marsh", summary: "s", fullDesc: "d", genre: "Fiction", primaryLanguage: "English", slug: "the-quiet-tide", slugTouched: true, ...d },
  media: { epub: { name: "b.epub", size: 1, status: "ready", progress: 100, speed: 0, eta: 0, proc: 100 } },
  images: { front: { name: "f.jpg", size: 1, w: 9, h: 9, url: "x", fx: 0.5, fy: 0.5 }, thumb: { name: "t.jpg", size: 1, w: 9, h: 9, url: "x", fx: 0.5, fy: 0.5 } },
});

describe("slug on edit", () => {
  it("a slug changed while editing is saved, and everything that pointed at the old one follows", async () => {
    act(() => {
      toggleMyList({ type: "Movie", slug: "crimson-horizon" });
      update((s) => ({ collections: s.collections.map((c, i) => (i === 0 ? { ...c, items: [{ type: "Movie" as const, slug: "crimson-horizon" }, ...c.items] } : c)) }));
    });
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Language, captions & tags/ }));
    await screen.findByLabelText("Primary Language");
    expect(val("Slug")).toBe("crimson-horizon");
    setVal("Slug", "Crimson Horizon 2026!");
    expect(val("Slug")).toBe("crimson-horizon-2026");
    fireEvent.click(screen.getByRole("button", { name: /Publish Review and go live/ }));
    await screen.findByText("Required details");
    fireEvent.click(screen.getByRole("button", { name: "Publish movie" }));
    await waitFor(() => expect(store().movies.some((m: { slug: string }) => m.slug === "crimson-horizon-2026")).toBe(true));
    const all: { slug: string }[] = store().movies;
    expect(all.some((m) => m.slug === "crimson-horizon")).toBe(false);
    expect(all).toHaveLength(10);
    expect(getUser().myList.map((i) => i.slug)).toContain("crimson-horizon-2026");
    expect(store().collections[0].items.map((i: { slug: string }) => i.slug)).toContain("crimson-horizon-2026");
  }, 60000);

  it("a slug that is already used gets a number instead of overwriting another title", async () => {
    renderAt("/admin/ebooks/the-quiet-tide/edit");
    await screen.findByRole("heading", { name: "Edit The Quiet Tide" });
    const taken = "atomic-mornings";
    fireEvent.click(screen.getByRole("button", { name: /Language & tags/ }));
    await screen.findByLabelText("Primary Language");
    setVal("Slug", taken);
    fireEvent.click(screen.getByRole("button", { name: /Publish Review and go live/ }));
    await screen.findByText("Required details");
    fireEvent.click(screen.getByRole("button", { name: "Publish eBook" }));
    await waitFor(() => expect(store().ebooks?.some((b: { slug: string }) => b.slug === `${taken}-2`)).toBe(true));
  }, 60000);
});

describe("Created and Updated", () => {
  it("a new title has the same created and updated date, and a legacy title says Not available instead of inventing one", async () => {
    const add = renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    expect(screen.getAllByText(today()).length).toBeGreaterThanOrEqual(2);
    add.unmount();
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(today())).toBeNull();
  });

  it("saving stamps Updated, keeps Created empty for legacy titles, and the edit form then shows the real date", async () => {
    const first = renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Publish Review and go live/ }));
    await screen.findByText("Required details");
    fireEvent.click(screen.getByRole("button", { name: "Publish movie" }));
    await waitFor(() => expect(store().movies?.find((m: { slug: string }) => m.slug === "crimson-horizon")?.updatedAt).toBeTruthy());
    const saved = store().movies.find((m: { slug: string }) => m.slug === "crimson-horizon");
    expect(saved.createdAt).toBeUndefined();
    first.unmount();
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    expect(screen.getByText(today())).toBeTruthy(); // Updated
    expect(screen.getAllByText("Not available").length).toBe(1); // Created is still unknown
  }, 60000);
});

describe("content IDs are never reused", () => {
  it("deleting the newest title does not give its number to the next one", async () => {
    act(() => {
      update((s) => ({ movies: [{ ...s.movies[0]!, slug: "temp", title: "Temp", cid: "MOV-000011" }, ...s.movies] }));
      reserveContentId("MOV-000011");
    });
    act(() => update((s) => ({ movies: s.movies.filter((m) => m.slug !== "temp") })));
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    expect(document.body.textContent).toContain("MOV-000012");
    expect(document.body.textContent).not.toContain("MOV-000011");
  });

  it("a number is spent as soon as a draft uses it, even if that draft is thrown away", async () => {
    const first = renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    expect(document.body.textContent).toContain("MOV-000011");
    setVal("Movie Title", "Draft one");
    await waitFor(() => expect(JSON.parse(localStorage.getItem("sv-drafts-v1") ?? "{}").drafts?.length ?? 0).toBeGreaterThan(0), { timeout: 4000 });
    await waitFor(() => expect(store().idSeq?.MOV).toBe(11));
    first.unmount();
    act(() => JSON.parse(localStorage.getItem("sv-drafts-v1")!).drafts.forEach((d: { id: string }) => deleteDraft(d.id)));
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    expect(document.body.textContent).toContain("MOV-000012");
  }, 60000);
});

describe("nothing is invented when a value is missing", () => {
  it("a book with no page count, rating, year or duration shows that honestly to customers", async () => {
    act(() => {
      update((s) => ({
        audiobooks: [{ ...s.audiobooks[0]!, slug: "bare-audio", title: "Bare Audio", pages: 0, rating: 0, reviews: 0, year: 0, cid: "AUD-000099" }, ...s.audiobooks],
        ebooks: [{ ...s.ebooks[0]!, slug: "bare-book", title: "Bare Book", pages: 0, rating: 0, reviews: 0, year: 0, cid: "EBK-000099" }, ...s.ebooks],
      }));
      update((s) => ({ audiobooks: s.audiobooks.map((b) => (b.slug === "bare-audio" ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== "duration")) as typeof b : b)) }));
      updateUser((s) => ({ ...s, role: "user" }));
    });
    const book = renderAt("/ebooks/bare-book");
    await screen.findByRole("heading", { level: 1, name: "Bare Book" });
    expect(screen.getByText("No ratings yet")).toBeTruthy();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThan(1);
    expect(screen.queryByText("300")).toBeNull();
    expect(screen.queryByText("4.5")).toBeNull();
    book.unmount();
    renderAt("/audiobooks/bare-audio");
    await screen.findByRole("heading", { level: 1, name: "Bare Audio" });
    expect(screen.getByText("Duration unavailable")).toBeTruthy();
    expect(screen.queryByText("8h 0m")).toBeNull();
  });

  it("publishing an eBook with no page count or publication date stores none, not 300 or this year", async () => {
    const add = renderAt("/admin/ebooks/new");
    await screen.findByLabelText("Title");
    setVal("Title", "Quiet Pages");
    setVal("Author", "A. Writer");
    setVal("Summary", "Short");
    setVal("Full Description", "Longer");
    fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "Fiction" } });
    next();
    await screen.findByLabelText("Primary Language");
    next();
    await screen.findByLabelText("PDF file");
    uploadFile("PDF", file("book.pdf", "%PDF-1.4"));
    await uploaded("pdf");
    next();
    await screen.findByLabelText("Front Cover image");
    uploadImage("Front Cover");
    await screen.findByAltText("Front Cover");
    uploadImage("Thumbnail");
    await screen.findByAltText("Thumbnail");
    next();
    next();
    await screen.findByText("Required details");
    fireEvent.click(screen.getByRole("button", { name: "Publish eBook" }));
    await waitFor(() => expect(store().ebooks?.[0]?.title).toBe("Quiet Pages"));
    const b = store().ebooks[0];
    expect(b.pages).toBe(0);
    expect(b.year).toBe(0);
    expect(b.rating).toBe(0);
    expect(b.meta["Publication Date"]).toBeUndefined();
    add.unmount();
  }, 60000);
});

describe("audiobook duration", () => {
  async function toAudioStep() {
    await screen.findByLabelText("Title");
    setVal("Title", "Quiet Voices");
    setVal("Author", "A. Voice");
    setVal("Summary", "Short");
    setVal("Full Description", "Long");
    fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "Fiction" } });
    next();
    await screen.findByLabelText("Narrator");
    setVal("Narrator", "Daniel Brooks");
    next();
    await screen.findByRole("radio", { name: /Single audiobook file/ });
  }

  it("when the length cannot be read it says so and offers a manual entry, never 8h 0m", async () => {
    renderAt("/admin/audiobooks/new");
    await toAudioStep();
    expect(screen.queryByRole("button", { name: "ENTER DURATION MANUALLY" })).toBeNull();
    uploadFile("Primary Audiobook Master File", file("book.m4b"));
    await uploaded("master");
    expect(await screen.findByText("Unable to detect duration")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ENTER DURATION MANUALLY" }));
    setVal("Total Duration (manual)", "8h 30m");
    expect(screen.getByText("8h 30m", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("8h 0m")).toBeNull();
  }, 60000);
});

describe("one age model", () => {
  it("books use Age Rating plus one restriction switch, and the old overlapping labels are gone", async () => {
    renderAt("/admin/ebooks/the-quiet-tide/edit");
    await screen.findByRole("heading", { name: "Edit The Quiet Tide" });
    fireEvent.click(screen.getByRole("button", { name: /Restrictions/ }));
    await screen.findByLabelText("Age Rating");
    for (const gone of ["Reading Age", "Listener Age", "Mature Content"]) expect(screen.queryByLabelText(gone)).toBeNull();
    expect(screen.queryByLabelText("Minimum Age")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Restrict access by minimum age" }));
    const min = screen.getByLabelText("Minimum Age") as HTMLSelectElement;
    expect([...min.options].map((o) => o.value).filter(Boolean)).toEqual(["7", "13", "16", "17", "18", "Custom"]);
    // turning it on without an age blocks publishing; choosing Custom lets any age through
    fireEvent.change(min, { target: { value: "Custom" } });
    fireEvent.change(screen.getByLabelText("Custom minimum age"), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish Review and go live/ }));
    await screen.findByText("Required details");
    fireEvent.click(screen.getByRole("button", { name: "Publish eBook" }));
    await waitFor(() => expect(store().ebooks?.find((b: { slug: string }) => b.slug === "the-quiet-tide")?.restrictions?.minAge).toBe(21));
  }, 60000);

  it("old values migrate: 'mature' with no age becomes a content warning, an old minimum age becomes the restriction", async () => {
    saveDraft("edit:eBook:the-quiet-tide", "eBook", "The Quiet Tide", readyEbook({ mature: true, minAge: "", warning: "", subscriberOnly: true }));
    const first = renderAt("/admin/ebooks/the-quiet-tide/edit");
    await screen.findByText(/Restored your unsaved edits/);
    fireEvent.click(screen.getByRole("button", { name: /Restrictions/ }));
    await screen.findByLabelText("Age Rating");
    expect(screen.getByRole("switch", { name: "Restrict access by minimum age" }).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByLabelText("Content Warning") as HTMLTextAreaElement).value).toContain("Mature themes");
    expect((screen.getByRole("radio", { name: "Subscribers Only" }) as HTMLInputElement).checked).toBe(true);
    first.unmount();
    deleteDraft("edit:eBook:the-quiet-tide");

    saveDraft("edit:eBook:the-quiet-tide", "eBook", "The Quiet Tide", readyEbook({ mature: false, minAge: "16" }));
    renderAt("/admin/ebooks/the-quiet-tide/edit");
    await screen.findByText(/Restored your unsaved edits/);
    fireEvent.click(screen.getByRole("button", { name: /Restrictions/ }));
    expect((await screen.findByRole("switch", { name: "Restrict access by minimum age" })).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Minimum Age") as HTMLSelectElement).value).toBe("16");
  }, 60000);
});

describe("restrictions step layout", () => {
  it("shows Visibility, Age and the restriction first, with the optional groups collapsed until they have values", async () => {
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Restrictions & availability/ }));
    await screen.findByLabelText("Age Rating");
    const visibility = screen.getByRole("radiogroup", { name: "Visibility" });
    const rating = screen.getByLabelText("Age Rating");
    expect(visibility.compareDocumentPosition(rating) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText("Minimum Age")).toBeNull();
    expect(openDetails("Territory & availability")?.open).toBe(false);
    expect(openDetails("Rights & licensing")?.open).toBe(false);
    // this seeded thriller has warnings saved, so that group opens by itself
    expect(openDetails("Content warnings")?.open).toBe(true);
  });
});

describe("publish step and optional steps", () => {
  it("new titles can only be published or scheduled; Archive appears only when editing an existing title", async () => {
    const add = renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    add.unmount();
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Publish Review and go live/ }));
    await screen.findByText("Required details");
    const group = screen.getByRole("radiogroup", { name: "Publishing options" });
    const names = [...group.querySelectorAll("input[type=radio]")].map((i) => i.parentElement?.textContent ?? "");
    expect(names.some((n) => n.includes("Publish now"))).toBe(true);
    expect(names.some((n) => n.includes("Schedule publishing"))).toBe(true);
    expect(names.some((n) => n.includes("Archive"))).toBe(true);
    expect(names.some((n) => /Save as draft/i.test(n))).toBe(false);
    // the one Save as Draft stays in the header
    expect(screen.getAllByRole("button", { name: /Save as Draft/ })).toHaveLength(1);
  });

  it("with auto-publish off, nothing is chosen for you and the button waits until you pick", async () => {
    act(() => update((s) => ({ settings: { ...s.settings, autoPublish: false } })));
    renderAt("/admin/ebooks/new");
    await screen.findByLabelText("Title");
    setVal("Title", "Quiet Pages");
    setVal("Author", "A. Writer");
    setVal("Summary", "Short");
    setVal("Full Description", "Longer");
    fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "Fiction" } });
    next();
    await screen.findByLabelText("Primary Language");
    next();
    await screen.findByLabelText("PDF file");
    uploadFile("PDF", file("book.pdf", "%PDF-1.4"));
    await uploaded("pdf");
    next();
    await screen.findByLabelText("Front Cover image");
    uploadImage("Front Cover");
    await screen.findByAltText("Front Cover");
    uploadImage("Thumbnail");
    await screen.findByAltText("Thumbnail");
    next();
    next();
    await screen.findByText("Required details");
    const go = screen.getByRole("button", { name: "Choose how to publish" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(screen.queryByRole("radio", { name: /Archive/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Publish now/ }));
    expect((screen.getByRole("button", { name: "Publish eBook" }) as HTMLButtonElement).disabled).toBe(false);
  }, 60000);

  it("the trailer step can be skipped, and Next never complains about an empty one", async () => {
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    setVal("Movie Title", "Skip Test");
    setVal("Short Description", "s");
    setVal("Full Description / Synopsis", "f");
    setVal("Release Date", "2020-01-01");
    setVal("Runtime", "100");
    fireEvent.change(screen.getByLabelText("Primary Genre"), { target: { value: "Drama" } });
    next();
    await screen.findByLabelText("Primary Language");
    next();
    await screen.findByLabelText("Main Movie File file");
    uploadFile("Main Movie File", file("m.mp4"));
    await uploaded("main");
    next();
    expect(await screen.findByRole("button", { name: "SKIP THIS STEP" })).toBeTruthy();
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "SKIP THIS STEP" }));
    expect(await screen.findByLabelText("Poster image")).toBeTruthy();
    expect(screen.queryByText(/is required/)).toBeNull();
  }, 60000);

  it("ADD LANGUAGE in the video step goes back to the one place languages are chosen, without losing anything", async () => {
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Video files/ }));
    await screen.findByLabelText("Main Movie File file");
    fireEvent.click(screen.getAllByRole("button", { name: /ADD LANGUAGE/ })[0]!);
    expect(await screen.findByLabelText("Primary Language")).toBeTruthy();
    expect(screen.getAllByDisplayValue("Spanish").length).toBeGreaterThan(0);
  });
});
