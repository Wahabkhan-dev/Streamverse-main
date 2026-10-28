import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { update } from "@/lib/store";
import { getUser, refKey, updateUser } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

const clockText = () => screen.getByText(/\d+:\d\d(:\d\d)? \/ \d+:\d\d(:\d\d)?/).textContent ?? "";

describe("movie player", () => {
  it("resumes from the saved position and shows title, time and duration", async () => {
    renderAt("/watch/neon-requiem");
    expect(await screen.findByRole("heading", { level: 1, name: "Neon Requiem" })).toBeTruthy();
    // seeded progress is 64% of 1h 56m, about 1:14
    expect(clockText()).toMatch(/^1:14:\d\d \/ 1:56:00$/);
  });

  it("starts from the beginning when nothing was saved", async () => {
    renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    expect(clockText()).toMatch(/^0:0\d \/ 2:28:00$/);
  });

  it("skip, seek and pause work, and closing saves progress", async () => {
    const view = renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: "Skip forward 10 seconds" }));
    expect(clockText()).toMatch(/^0:1\d \/ /);
    fireEvent.change(screen.getByLabelText("Seek"), { target: { value: "3600" } });
    expect(clockText()).toMatch(/^1:00:0\d \/ /);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0);
    view.unmount();
    const saved = getUser().progress[refKey({ type: "Movie", slug: "crimson-horizon" })];
    expect(saved?.seconds).toBeGreaterThanOrEqual(3600);
    expect(saved?.pct).toBeGreaterThan(20);
    expect(getUser().history[0]?.slug).toBe("crimson-horizon");
  });

  it("reopening resumes where the movie was left", async () => {
    const first = renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    fireEvent.change(screen.getByLabelText("Seek"), { target: { value: "5000" } });
    first.unmount();
    renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    expect(clockText()).toMatch(/^1:23:\d\d \/ /);
  });

  it("the settings menu changes quality, audio and subtitles, and the speed menu changes speed", async () => {
    renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const menu = await screen.findByRole("menu", { name: "Player settings" });
    expect(menu.textContent).toContain("Quality");
    expect(menu.textContent).toContain("Audio");
    expect(menu.textContent).toContain("Subtitles");

    fireEvent.click(screen.getByRole("button", { name: /^Quality/ }));
    for (const q of ["Auto", "4K", "1080p", "720p", "480p"]) expect(screen.getByRole("radio", { name: q })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "720p" }));

    fireEvent.click(screen.getByRole("button", { name: /^Subtitles/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Spanish" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Subtitles/ }).textContent).toContain("Spanish"));
    expect(screen.getByRole("button", { name: /^Quality/ }).textContent).toContain("720p");

    fireEvent.click(screen.getByRole("button", { name: /^Audio/ }));
    expect(screen.getByRole("radio", { name: "French" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "French" }));

    fireEvent.click(screen.getByRole("button", { name: "Playback speed 1x" }));
    fireEvent.click(screen.getByRole("radio", { name: "1.5x" }));
    expect(screen.getByRole("button", { name: "Playback speed 1.5x" })).toBeTruthy();
  });

  it("volume and mute are available", async () => {
    renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
    expect(screen.getByLabelText("Volume")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Full screen/ })).toBeTruthy();
  });

  it("keyboard: space pauses, arrows seek", async () => {
    renderAt("/watch/crimson-horizon");
    await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" });
    fireEvent.keyDown(window, { key: " " });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(clockText()).toMatch(/^0:05 \/ /);
  });

  it("plays a trailer, not the film", async () => {
    renderAt("/watch/crimson-horizon?trailer=official");
    expect(await screen.findByText(/Trailer · Official Trailer/)).toBeTruthy();
    expect(clockText()).toMatch(/ \/ 2:10$/);
    // trailers don't touch the film's progress
    expect(getUser().progress[refKey({ type: "Movie", slug: "crimson-horizon" })]).toBeUndefined();
  });

  it("shows a restriction screen instead of the player", async () => {
    act(() => update((s) => ({ movies: s.movies.map((m) => (m.slug === "glass-quiet" ? { ...m, restrictions: { access: "Subscribers Only" as const } } : m)) })));
    act(() => updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "expired" } })));
    renderAt("/watch/glass-quiet");
    expect(await screen.findByText("Subscribers only")).toBeTruthy();
    expect(screen.queryByLabelText("Seek")).toBeNull();
  });

  it("an unknown title says it is unavailable", async () => {
    renderAt("/watch/does-not-exist");
    expect(await screen.findByText("This title is unavailable")).toBeTruthy();
  });
});

describe("eBook reader", () => {
  it("opens on the saved page and shows progress", async () => {
    renderAt("/read/the-quiet-tide");
    expect(await screen.findByLabelText("Page 164 of 400")).toBeTruthy();
    expect(screen.getByText("41% read")).toBeTruthy();
  });

  it("turns pages with the buttons and the keyboard, and saves the page", async () => {
    const view = renderAt("/read/the-quiet-tide");
    await screen.findByLabelText("Page 164 of 400");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByLabelText("Page 165 of 400")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByLabelText("Page 163 of 400")).toBeTruthy();
    view.unmount();
    expect(getUser().progress[refKey({ type: "eBook", slug: "the-quiet-tide" })]?.page).toBe(163);
  });

  it("reopening resumes on the same page", async () => {
    const first = renderAt("/read/ash-and-iron");
    await screen.findByLabelText(/Page 1 of/);
    fireEvent.change(screen.getByLabelText("Go to page"), { target: { value: "42" } });
    expect(await screen.findByLabelText(/Page 42 of/)).toBeTruthy();
    first.unmount();
    renderAt("/read/ash-and-iron");
    expect(await screen.findByLabelText(/Page 42 of/)).toBeTruthy();
  });

  it("table of contents, bookmarks, font size and themes", async () => {
    renderAt("/read/the-quiet-tide");
    await screen.findByLabelText("Page 164 of 400");

    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    const toc = await screen.findByRole("complementary", { name: "Table of contents" });
    expect(toc.querySelectorAll("button[aria-current]").length).toBeGreaterThan(5);
    fireEvent.click(toc.querySelectorAll("button[aria-current]")[3] as HTMLElement);
    expect(await screen.findByLabelText(/Page 100 of 400/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Bookmark this page" }));
    expect(getUser().bookmarks["the-quiet-tide"]).toEqual([100]);
    expect(screen.getByRole("button", { name: "Remove bookmark" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Increase font size" }));
    expect(getUser().prefs.readerFont).toBe(20);
    fireEvent.click(screen.getByRole("radio", { name: "Sepia theme" }));
    expect(getUser().prefs.readerTheme).toBe("sepia");
    fireEvent.click(screen.getByRole("radio", { name: "Light theme" }));
    expect(getUser().prefs.readerTheme).toBe("light");
    expect(screen.getByRole("button", { name: "Fullscreen reader" })).toBeTruthy();
  });

  it("searches inside the book and jumps to a match", async () => {
    renderAt("/read/the-quiet-tide");
    await screen.findByLabelText("Page 164 of 400");
    fireEvent.click(screen.getByRole("button", { name: "Search in book" }));
    const box = await screen.findByLabelText("Search in book", { selector: "input" });
    fireEvent.change(box, { target: { value: "lantern" } });
    const hits = await screen.findAllByRole("button", { name: /^Page \d+/ });
    expect(hits.length).toBeGreaterThan(0);
    fireEvent.click(hits[0]!);
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Search in book" })).toBeNull);
  });

  it("a book with no matches says so", async () => {
    renderAt("/read/the-quiet-tide");
    await screen.findByLabelText("Page 164 of 400");
    fireEvent.click(screen.getByRole("button", { name: "Search in book" }));
    fireEvent.change(await screen.findByLabelText("Search in book", { selector: "input" }), { target: { value: "zzzzzqq" } });
    expect(await screen.findByText(/No matches/)).toBeTruthy();
  });
});

describe("audiobook player", () => {
  it("opens on the saved chapter with cover, author, narrator and chapter list", async () => {
    renderAt("/listen/kingdom-of-salt");
    expect(await screen.findByRole("heading", { level: 1, name: "Kingdom of Salt" })).toBeTruthy();
    expect(screen.getByText(/Narrated by Fiona Grey/)).toBeTruthy();
    expect(screen.getByText("Now playing").parentElement?.textContent).toContain("Chapter 9");
    expect(screen.getByRole("complementary", { name: "Chapters" }).querySelectorAll("li").length).toBeGreaterThanOrEqual(12);
  });

  it("chapters can be chosen, and skip buttons move the position", async () => {
    renderAt("/listen/kingdom-of-salt");
    await screen.findByRole("heading", { level: 1, name: "Kingdom of Salt" });
    const list = screen.getByRole("complementary", { name: "Chapters" });
    fireEvent.click(list.querySelectorAll("button")[2] as HTMLElement);
    await waitFor(() => expect(screen.getByText("Now playing").parentElement?.textContent).toContain("Chapter 3"));
    const before = screen.getByLabelText("Timeline").getAttribute("aria-valuetext");
    fireEvent.click(screen.getByRole("button", { name: "Skip forward 30 seconds" }));
    expect(screen.getByLabelText("Timeline").getAttribute("aria-valuetext")).not.toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Skip back 10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await waitFor(() => expect(screen.getByText("Now playing").parentElement?.textContent).toContain("Chapter 4"));
  });

  it("play / pause, speed and sleep timer", async () => {
    renderAt("/listen/kingdom-of-salt");
    await screen.findByRole("heading", { level: 1, name: "Kingdom of Salt" });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getAllByRole("button", { name: "Pause" }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Playback speed/ }));
    for (const s of ["0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x"]) expect(screen.getByRole("menuitemradio", { name: s })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1.75x" }));
    expect(screen.getByRole("button", { name: "Playback speed 1.75x" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Sleep timer/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "5 minutes" }));
    expect(await screen.findByRole("button", { name: /left/ })).toBeTruthy();
    expect(screen.getByLabelText("Volume")).toBeTruthy();
  });

  it("saves chapter, time and percentage, and resumes there", async () => {
    const first = renderAt("/listen/echoes-of-mars");
    await screen.findByRole("heading", { level: 1, name: "Echoes of Mars" });
    const list = screen.getByRole("complementary", { name: "Chapters" });
    fireEvent.click(list.querySelectorAll("button")[6] as HTMLElement);
    first.unmount();
    const saved = getUser().progress[refKey({ type: "Audiobook", slug: "echoes-of-mars" })];
    expect(saved?.chapter).toBe(6);
    expect(saved?.pct).toBeGreaterThan(40);
    renderAt("/listen/echoes-of-mars");
    await screen.findByRole("heading", { level: 1, name: "Echoes of Mars" });
    expect(screen.getByText("Now playing").parentElement?.textContent).toContain("Chapter 7");
  });

  it("the Listen page opens a chosen chapter from the detail page", async () => {
    renderAt("/listen/echoes-of-mars?chapter=2");
    await screen.findByRole("heading", { level: 1, name: "Echoes of Mars" });
    expect(screen.getByText("Now playing").parentElement?.textContent).toContain("Chapter 3");
  });
});
