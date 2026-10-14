import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveDraft } from "@/lib/drafts";
import { update } from "@/lib/store";
import { file, next, pick, renderAt, resetAll, setVal, uploadFile, uploadImage } from "./utils";

beforeEach(() => resetAll("admin"));
afterEach(() => cleanup());

const savedStore = () => JSON.parse(localStorage.getItem("sv-store-v2") ?? "{}");
const uploaded = (slot: string) => waitFor(() => expect(document.getElementById(`f-${slot}`)?.textContent).toMatch(/Processing|Ready/));
const val = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const systemText = () => document.body.textContent ?? "";

async function movieBasics() {
  setVal("Movie Title", "The Last Horizon");
  setVal("Short Description", "A short pitch");
  setVal("Full Description / Synopsis", "A longer synopsis");
  setVal("Release Date", "2019-06-01");
  setVal("Runtime", "142");
  fireEvent.change(screen.getByLabelText("Primary Genre"), { target: { value: "Drama" } });
}

describe("movie form cleanup", () => {
  it("shows system information that the admin never types, and a sequential Internal Content ID", async () => {
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    expect(screen.getByText("Internal Content ID")).toBeTruthy();
    // ten seeded movies, so the next one is 11
    expect(systemText()).toContain("MOV-000011");
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Updated")).toBeTruthy();
    expect(screen.getByText("System-controlled")).toBeTruthy();
    // none of the system values is an input
    expect(screen.queryByLabelText("Internal Content ID")).toBeNull();
  });

  it("asks for each person once: Director, Producer and Writer live only in Cast & Crew", async () => {
    const add = renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    for (const l of ["Director", "Producer", "Writer"]) expect(screen.queryByLabelText(l)).toBeNull();
    add.unmount();
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Cast & crew/ }));
    expect(await screen.findByLabelText("Director")).toBeTruthy();
    expect(screen.getByLabelText("Producer")).toBeTruthy();
    expect(screen.getByLabelText("Writer")).toBeTruthy();
  });

  it("derives obvious values: runtime display, release year, original language, SEO title/description and slug", async () => {
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    await movieBasics();
    expect(screen.getByText("Shown to customers as 2h 22m")).toBeTruthy();
    expect(screen.getByText("Release year: 2019")).toBeTruthy();
    next();
    await screen.findByLabelText("Primary Language");
    // original language follows the primary language until it is changed by hand
    expect(val("Original Language")).toBe("English");
    await pick("Primary Language", "French");
    expect(val("Original Language")).toBe("French");
    expect(val("SEO Title")).toBe("The Last Horizon");
    expect(val("SEO Description")).toBe("A short pitch");
    expect(val("Slug")).toBe("the-last-horizon");
    // an edited SEO title stops following the title
    setVal("SEO Title", "Custom title");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByLabelText("Movie Title");
    setVal("Movie Title", "Another Name");
    next();
    await screen.findByLabelText("Primary Language");
    expect(val("SEO Title")).toBe("Custom title");
    expect(val("Slug")).toBe("another-name");
  });

  it("Country is optional and optional fields say so", async () => {
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    await movieBasics();
    next();
    // the wizard moves on without a country
    expect(await screen.findByLabelText("Primary Language")).toBeTruthy();
    expect(screen.getAllByText("Optional").length).toBeGreaterThan(3);
  });

  it("defaults: visibility is Subscribers Only, promotion flags are off, status is Draft", async () => {
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    fireEvent.click(screen.getByRole("button", { name: /Restrictions & availability/ }));
    // jumping ahead is blocked until earlier steps are valid, so read the default from the saved draft instead
    await movieBasics();
    await waitFor(() => expect(localStorage.getItem("sv-drafts-v1")).toBeTruthy(), { timeout: 4000 });
    const d = JSON.parse(localStorage.getItem("sv-drafts-v1")!).drafts?.[0]?.snapshot?.d ?? JSON.parse(localStorage.getItem("sv-drafts-v1")!)[0]?.snapshot?.d;
    expect(d.access).toBe("Subscribers Only");
    expect(d.promo).toEqual({});
    expect(d.copyrightYear).toBe(String(new Date().getFullYear()));
    expect(d.contentId).toBe("MOV-000011");
  });

  it("suggests a minimum age for the rating without applying it", async () => {
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: /Restrictions & availability/ }));
    await screen.findByLabelText("Age Rating");
    fireEvent.change(screen.getByLabelText("Age Rating"), { target: { value: "R" } });
    // the restriction is off by default, so there is no minimum age to suggest yet
    expect(screen.queryByLabelText("Minimum Age")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Restrict access by minimum age" }));
    expect(await screen.findByText(/Suggested for R/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use 17" }));
    expect((screen.getByLabelText("Minimum Age") as HTMLSelectElement).value).toBe("17");
  });

  it("the trailer is optional and the thumbnail can be made from the backdrop", async () => {
    renderAt("/admin/movies/new");
    await screen.findByLabelText("Movie Title");
    await movieBasics();
    next();
    await screen.findByLabelText("Primary Language");
    next();
    await screen.findByLabelText("Main Movie File file");
    uploadFile("Main Movie File", file("movie.mp4"));
    await uploaded("main");
    next();
    await screen.findByLabelText("Official Trailer file");
    next(); // no trailer uploaded
    await screen.findByLabelText("Poster image");
    uploadImage("Poster");
    await screen.findByAltText("Poster");
    uploadImage("Backdrop");
    await screen.findByAltText("Backdrop");
    fireEvent.click(screen.getByRole("switch", { name: "Use backdrop as thumbnail" }));
    expect(await screen.findByAltText("Thumbnail preview from backdrop")).toBeTruthy();
    next();
    expect(await screen.findByLabelText("Cinematographer")).toBeTruthy();
  }, 60000);

  it("existing titles still open: they get a number, and keep their old values", async () => {
    renderAt("/admin/movies/crimson-horizon/edit");
    await screen.findByRole("heading", { name: "Edit Crimson Horizon" });
    expect(systemText()).toContain("MOV-000001");
    expect(val("Movie Title")).toBe("Crimson Horizon");
    expect(savedStore().movies).toBeUndefined(); // nothing was written just by opening it
  });
});

describe("eBook form cleanup", () => {
  async function ebookBasics() {
    setVal("Title", "Quiet Pages");
    setVal("Author", "A. Writer");
    setVal("Summary", "Short summary");
    setVal("Full Description", "Longer description");
    fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "Fiction" } });
  }

  it("has a content ID, no duplicate Translator field, and a Series Number that appears only with a series", async () => {
    renderAt("/admin/ebooks/new");
    await screen.findByLabelText("Title");
    expect(systemText()).toMatch(/EBK-0000\d\d/);
    expect(screen.queryByLabelText("Translator")).toBeNull();
    expect(screen.queryByLabelText("Series Number")).toBeNull();
    setVal("Series", "The Tide Cycle");
    expect(screen.getByLabelText("Series Number")).toBeTruthy();
    expect(screen.getByLabelText("ISBN")).toBeTruthy();
  });

  it("one digital file is enough: a PDF alone publishes, and back cover and spine are optional", async () => {
    const admin = renderAt("/admin/ebooks/new");
    await screen.findByLabelText("Title");
    await ebookBasics();
    next();
    await screen.findByLabelText("Primary Language");
    next();
    await screen.findByLabelText("PDF file");
    next();
    expect(await screen.findByText("At least one digital book file is required (EPUB or PDF).")).toBeTruthy();
    uploadFile("PDF", file("book.pdf", "%PDF-1.4 body"));
    await uploaded("pdf");
    next();
    await screen.findByLabelText("Front Cover image");
    expect(screen.queryByText("Back cover is required.")).toBeNull();
    uploadImage("Front Cover");
    await screen.findByAltText("Front Cover");
    uploadImage("Thumbnail");
    await screen.findByAltText("Thumbnail");
    next();
    await screen.findByRole("radio", { name: "Subscribers Only" });
    expect((screen.getByRole("radio", { name: "Subscribers Only" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("Copyright Year")).toBeTruthy();
    next();
    await screen.findByText("Required details");
    expect(screen.queryAllByText("Fix")).toHaveLength(0);
    expect(screen.getByText("System generated")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish eBook" }));
    await waitFor(() => expect(savedStore().ebooks?.[0]?.title).toBe("Quiet Pages"));
    const saved = savedStore().ebooks[0];
    expect(saved.cid).toMatch(/^EBK-\d{6}$/);
    expect(saved.createdAt).toBeTruthy();
    expect(saved.restrictions.access).toBe("Subscribers Only");
    admin.unmount();
  }, 60000);

  it("translations stay hidden until added", async () => {
    renderAt("/admin/ebooks/new");
    await screen.findByLabelText("Title");
    await ebookBasics();
    next();
    await screen.findByLabelText("Primary Language");
    expect(screen.queryByLabelText("Translated Title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ADD TRANSLATION/ }));
    expect(await screen.findByLabelText("Translated Title")).toBeTruthy();
    expect(val("Original Language")).toBe("English");
  });

  it("an existing title keeps the visibility it already had instead of the new default", async () => {
    renderAt("/admin/ebooks/the-quiet-tide/edit");
    await screen.findByRole("heading", { name: "Edit The Quiet Tide" });
    fireEvent.click(screen.getByRole("button", { name: /Restrictions/ }));
    const pub = (await screen.findByRole("radio", { name: "Public" })) as HTMLInputElement;
    expect(pub.checked).toBe(true);
  });
});

describe("audiobook form cleanup", () => {
  async function audioToFiles() {
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

  it("has a content ID, and a clear single-file or chapter-files choice that never asks for both", async () => {
    renderAt("/admin/audiobooks/new");
    await screen.findByLabelText("Title");
    expect(systemText()).toMatch(/AUD-0000\d\d/);
    expect(screen.queryByLabelText("Total Duration")).toBeNull();
    await audioToFiles();
    expect(screen.getByLabelText("Primary Audiobook Master File file")).toBeTruthy();
    expect(screen.getByText("Total Duration")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Chapter files/ }));
    await waitFor(() => expect(screen.queryByLabelText("Primary Audiobook Master File file")).toBeNull());
    expect(screen.getByText("Each chapter's audio file is added in Chapters.")).toBeTruthy();
  }, 60000);

  it("chapter end times and durations are calculated from the next chapter's start", async () => {
    renderAt("/admin/audiobooks/new");
    await screen.findByLabelText("Title");
    await audioToFiles();
    uploadFile("Primary Audiobook Master File", file("book.m4b"));
    await uploaded("master");
    next();
    await screen.findByLabelText("Chapter Title");
    fireEvent.click(screen.getByRole("button", { name: /ADD CHAPTER/ }));
    const starts = await screen.findAllByLabelText("Start Time");
    expect(starts).toHaveLength(1); // chapter 1 always starts at 0:00; only chapter 2 is editable
    fireEvent.change(starts[0]!, { target: { value: "10:00" } });
    await waitFor(() => expect(screen.getAllByText("10:00").length).toBeGreaterThanOrEqual(2)); // chapter 1: end and duration
    expect(screen.getByLabelText("Chapter number 1")).toBeTruthy();
    expect(screen.queryByLabelText("Duration")).toBeNull(); // not an input
  }, 60000);

  it("the thumbnail can be made from the cover", async () => {
    renderAt("/admin/audiobooks/new");
    await screen.findByLabelText("Title");
    await audioToFiles();
    uploadFile("Primary Audiobook Master File", file("book.m4b"));
    await uploaded("master");
    next();
    await screen.findByLabelText("Chapter Title");
    next();
    await screen.findByLabelText("Cover image");
    uploadImage("Cover");
    await screen.findByAltText("Cover");
    fireEvent.click(screen.getByRole("switch", { name: "Use cover to generate thumbnail" }));
    expect(await screen.findByAltText("Thumbnail preview from cover")).toBeTruthy();
    next();
    expect(await screen.findByRole("radio", { name: "Subscribers Only" })).toBeTruthy();
  }, 60000);
});

describe("seeded content keeps working", () => {
  it("every catalog item has a unique reference number", async () => {
    renderAt("/admin/movies");
    await screen.findByRole("heading", { name: "Movies" });
    act(() => update((s) => ({ movies: s.movies })));
    const all = savedStore();
    for (const [key, prefix] of [["movies", "MOV"], ["ebooks", "EBK"], ["audiobooks", "AUD"]] as const) {
      const ids: string[] = all[key].map((i: { cid: string }) => i.cid);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((i) => i.startsWith(prefix))).toBe(true);
    }
  });
});
