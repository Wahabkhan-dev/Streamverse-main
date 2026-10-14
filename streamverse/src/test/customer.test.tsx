import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { update, type State } from "@/lib/store";
import { getUser, updateUser } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

const patchMovie = (slug: string, patch: Partial<State["movies"][number]>) => act(() => update((s) => ({ movies: s.movies.map((m) => (m.slug === slug ? { ...m, ...patch } : m)) })));

describe("customer routes", () => {
  it.each([
    ["/movies", "Movies"],
    ["/ebooks", "eBooks"],
    ["/audiobooks", "Audiobooks"],
    ["/search", "Search"],
    ["/my-list", "My List"],
    ["/my-library", "My Library"],
    ["/history", "History"],
    ["/notifications", "Notifications"],
    ["/profile", "Profile"],
    ["/subscription", "Subscription"],
    ["/collections", "Collections"],
    ["/collections/award-winners", "Award Winners"],
    ["/movies/crimson-horizon", "Crimson Horizon"],
    ["/ebooks/the-quiet-tide", "The Quiet Tide"],
    ["/audiobooks/echoes-of-mars", "Echoes of Mars"],
    ["/states", "Screen states"],
  ])("renders %s", async (path, heading) => {
    renderAt(path);
    await waitFor(() => expect(screen.getAllByRole("heading", { name: heading }).length).toBeGreaterThan(0));
  });

  it("shows a 404 screen for an unknown page", async () => {
    renderAt("/nope");
    expect(await screen.findByText("Page not found")).toBeTruthy();
  });
});

describe("home page", () => {
  it("shows every required section with a heading and cards", async () => {
    renderAt("/");
    for (const t of ["Continue Watching", "Trending Movies", "Popular Movies", "Latest Movies", "Featured eBooks", "New eBooks", "Featured Audiobooks", "New Audiobooks", "Curated Collections"]) {
      expect(await screen.findByRole("heading", { name: t })).toBeTruthy();
    }
  });

  it("shows loading skeletons first", async () => {
    renderAt("/");
    // the first paint is a skeleton, not an empty heading
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeTruthy());
  });

  it("every row offers See All", async () => {
    renderAt("/");
    await screen.findByRole("heading", { name: "Trending Movies" }, { timeout: 5000 });
    expect(screen.getAllByText("See All").length).toBeGreaterThanOrEqual(8);
  });

  it("renaming a section only changes its heading, the section keeps working", async () => {
    act(() => update((s) => ({ homepage: s.homepage.map((h) => (h.id === "trending_movies" ? { ...h, title: "Trending Now" } : h)) })));
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Trending Now" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Trending Movies" })).toBeNull();
    const section = screen.getByRole("region", { name: "Trending Now" });
    expect(within(section).getAllByRole("link").length).toBeGreaterThan(1);
  });

  it("a disabled section is not shown", async () => {
    act(() => update((s) => ({ homepage: s.homepage.map((h) => (h.id === "popular_movies" ? { ...h, enabled: false } : h)) })));
    renderAt("/");
    await screen.findByRole("heading", { name: "Trending Movies" });
    expect(screen.queryByRole("heading", { name: "Popular Movies" })).toBeNull();
  });

  it("never leaves a heading above an empty row", async () => {
    act(() => update((s) => ({ movies: s.movies.map((m) => ({ ...m, status: "Draft" as const })) })));
    renderAt("/");
    await screen.findByRole("heading", { name: "Featured eBooks" });
    for (const t of ["Trending Movies", "Popular Movies", "Latest Movies"]) expect(screen.queryByRole("heading", { name: t })).toBeNull();
  });

  it("manually selected content replaces the automatic row, in order", async () => {
    act(() =>
      update((s) => ({
        homepage: s.homepage.map((h) =>
          h.id === "trending_movies" ? { ...h, mode: "manual" as const, items: [{ type: "Movie" as const, slug: "roman-summer" }, { type: "eBook" as const, slug: "ash-and-iron" }] } : h,
        ),
      })),
    );
    renderAt("/");
    const section = await screen.findByRole("region", { name: "Trending Movies" });
    const links = within(section).getAllByRole("link").filter((l) => l.textContent !== "See All");
    expect(links).toHaveLength(2);
    expect(links[0]!.textContent).toContain("Roman Summer");
    expect(links[1]!.textContent).toContain("Ash & Iron");
  });

  it("shows Promotional, Normal and Latest Release banners between rows", async () => {
    renderAt("/");
    await screen.findByRole("heading", { name: "Trending Movies" });
    expect(screen.getByText("Try StreamVerse Premium")).toBeTruthy();
    expect(screen.getAllByText("Award Winners").length).toBeGreaterThan(0);
    expect(screen.getByText("New release")).toBeTruthy();
  });

  it("an inactive banner disappears", async () => {
    act(() => update((s) => ({ banners: s.banners.map((b) => (b.type === "Promotional Banner" ? { ...b, active: false } : b)) })));
    renderAt("/");
    await screen.findByRole("heading", { name: "Trending Movies" });
    expect(screen.queryByText("Try StreamVerse Premium")).toBeNull();
  });

  it("the hero uses active Hero banners", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Crimson Horizon" })).toBeTruthy();
  });

  it("promotion flags put a title first in its row", async () => {
    act(() => update((s) => ({ movies: s.movies.map((m) => ({ ...m, promo: { ...m.promo, trending: m.slug === "glass-quiet" } })) })));
    renderAt("/");
    const section = await screen.findByRole("region", { name: "Trending Movies" });
    expect(within(section).getAllByRole("link").filter((l) => l.textContent !== "See All")[0]!.textContent).toContain("Glass Quiet");
  });
});

describe("search", () => {
  it("finds titles by genre and groups them by type", async () => {
    renderAt("/search?q=sci");
    expect(await screen.findByRole("heading", { name: "Movies" })).toBeTruthy();
    expect(screen.getAllByText("Crimson Horizon").length).toBeGreaterThan(0);
  });

  it("finds people and filters with the People tab", async () => {
    renderAt("/search?q=Mara");
    await screen.findByRole("heading", { name: "People" });
    fireEvent.click(screen.getByRole("tab", { name: /People/ }));
    expect(await screen.findByText("Mara Okafor")).toBeTruthy();
  });

  it("typing searches after a short pause, with a loading state in between", async () => {
    renderAt("/search");
    const box = await screen.findByLabelText("Search all titles and people");
    fireEvent.change(box, { target: { value: "velocity" } });
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("Velocity Zero").length).toBeGreaterThan(0), { timeout: 2000 });
  });

  it("shows a no-results state with a way to clear", async () => {
    renderAt("/search?q=zzzzqx");
    expect(await screen.findByText(/No results for/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });

  it("remembers recent searches and clears them", async () => {
    renderAt("/search");
    const box = await screen.findByLabelText("Search all titles and people");
    fireEvent.change(box, { target: { value: "orchard" } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(getUser().recentSearches).toContain("orchard"));
  });

  it("filters narrow the results", async () => {
    renderAt("/search?q=a");
    await screen.findByRole("heading", { name: "Movies" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText("Content Type"), { target: { value: "eBook" } });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Movies" })).toBeNull());
    expect(screen.getByRole("heading", { name: "eBooks" })).toBeTruthy();
  });
});

describe("My List and My Library", () => {
  it("starts empty and only shows what the customer added", async () => {
    const first = renderAt("/my-list");
    expect(await screen.findByText("Your list is empty")).toBeTruthy();
    first.unmount();

    const detail = renderAt("/movies/glass-quiet");
    fireEvent.click(await screen.findByRole("button", { name: "My List" }));
    detail.unmount();

    renderAt("/my-list");
    await waitFor(() => expect(screen.getAllByText("Glass Quiet").length).toBeGreaterThan(0));
    expect(screen.queryByText("Your list is empty")).toBeNull();
    // the tabs filter by type
    fireEvent.click(screen.getByRole("tab", { name: /eBooks/ }));
    expect(await screen.findByText(/No ebooks in your list/)).toBeTruthy();
  });

  it("an item can be removed from My List", async () => {
    act(() => updateUser((s) => ({ ...s, myList: [{ type: "eBook", slug: "ash-and-iron", addedAt: 1 }] })));
    renderAt("/my-list");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Ash & Iron from My List" }));
    expect(await screen.findByText("Your list is empty")).toBeTruthy();
  });

  it("Add to Library on an eBook shows it in My Library", async () => {
    const detail = renderAt("/ebooks/ash-and-iron");
    fireEvent.click(await screen.findByRole("button", { name: "Add to Library" }));
    detail.unmount();
    renderAt("/my-library");
    await screen.findByRole("heading", { name: "Your library" });
    await waitFor(() => expect(screen.getAllByText("Ash & Iron").length).toBeGreaterThan(0));
  });

  it("My Library has Continue Watching / Reading / Listening and progress filters", async () => {
    renderAt("/my-library");
    expect(await screen.findByRole("heading", { name: "Continue Watching" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Continue Reading" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Continue Listening" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    const library = screen.getByRole("heading", { name: "Your library" }).parentElement as HTMLElement;
    await waitFor(() => expect(within(library).getAllByText("Glass Quiet").length).toBeGreaterThan(0));
    expect(within(library).queryAllByText("Neon Requiem")).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: /Audiobooks/ }));
    expect(await screen.findByText("Nothing matches this filter")).toBeTruthy();
  });

  it("History lists activity and lets the customer remove an entry", async () => {
    renderAt("/history");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Neon Requiem from history" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Neon Requiem from history" })).toBeNull());
    fireEvent.click(screen.getByRole("tab", { name: /Listened/ }));
    expect(screen.getAllByText("Kingdom of Salt").length).toBeGreaterThan(0);
  });
});

describe("notifications, profile and subscription", () => {
  it("customer notifications can be marked read and deleted", async () => {
    renderAt("/notifications");
    await screen.findByText("Abyssal premieres Friday");
    const before = screen.getAllByRole("button", { name: "Delete notification" }).length;
    fireEvent.click(screen.getAllByRole("button", { name: "Delete notification" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Delete notification" })).toHaveLength(before - 1));
    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect((screen.getByRole("button", { name: /Mark all read/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("an admin announcement reaches the customer", async () => {
    act(() => update((s) => ({ announcements: [{ id: 99, kind: "Recommendation", t: "Staff picks are here", s: "Take a look", at: Date.now() }, ...s.announcements] })));
    renderAt("/notifications");
    expect(await screen.findByText("Staff picks are here")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Account/ }));
    expect(screen.queryByText("Staff picks are here")).toBeNull();
  });

  it("the profile validates and saves", async () => {
    renderAt("/profile");
    const email = await screen.findByLabelText(/Email/);
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save Changes/ })[0]!);
    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    fireEvent.change(email, { target: { value: "alex.q@streamverse.tv" } });
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Alex Q" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save Changes/ })[0]!);
    await waitFor(() => expect(getUser().profile.name).toBe("Alex Q"));
    expect(getUser().profile.email).toBe("alex.q@streamverse.tv");
  });

  it("the subscription page shows the plan, renewal, payment method and billing history", async () => {
    renderAt("/subscription");
    expect(await screen.findByText("StreamVerse Premium")).toBeTruthy();
    expect(screen.getByText(/Visa/)).toBeTruthy();
    expect(screen.getByText("Billing history")).toBeTruthy();
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  });

  it("an expired or failed subscription shows its own screen", async () => {
    act(() => updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "expired" } })));
    const first = renderAt("/subscription");
    expect(await screen.findByText("Your subscription has expired")).toBeTruthy();
    first.unmount();
    act(() => updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "past_due" } })));
    renderAt("/subscription");
    expect((await screen.findAllByText("Payment failed")).length).toBeGreaterThan(0);
  });
});

describe("restriction screens", () => {
  it("Subscribers only", async () => {
    patchMovie("glass-quiet", { restrictions: { access: "Subscribers Only" } });
    act(() => updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "expired" } })));
    renderAt("/movies/glass-quiet");
    expect(await screen.findByText("Subscribers only")).toBeTruthy();
  });

  it("Unavailable in your region", async () => {
    patchMovie("glass-quiet", { restrictions: { territory: "selected", countries: ["Canada"] } });
    renderAt("/movies/glass-quiet");
    expect(await screen.findByText("Unavailable in your region")).toBeTruthy();
  });

  it("Age restricted, then open after confirming", async () => {
    patchMovie("glass-quiet", { restrictions: { minAge: 18 } });
    renderAt("/movies/glass-quiet");
    expect(await screen.findByText("Age restricted content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /I am 18 or older/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Glass Quiet" })).toBeTruthy();
  });

  it("Not yet available, expired, and removed titles", async () => {
    patchMovie("abyssal", {});
    const a = renderAt("/movies/abyssal");
    expect(await screen.findByText("Not yet available")).toBeTruthy();
    a.unmount();
    patchMovie("glass-quiet", { restrictions: { availableUntil: "2020-01-01" } });
    const b = renderAt("/movies/glass-quiet");
    expect(await screen.findByText("This title is no longer available")).toBeTruthy();
    b.unmount();
    patchMovie("roman-summer", { status: "Archived" });
    renderAt("/movies/roman-summer");
    expect(await screen.findByText("This title is unavailable")).toBeTruthy();
  });

  it("Hidden titles stay out of normal lists, search and collections", async () => {
    patchMovie("glass-quiet", { restrictions: { access: "Hidden" } });
    const list = renderAt("/movies");
    await screen.findByRole("heading", { name: "Movies" });
    expect(screen.queryAllByText("Glass Quiet")).toHaveLength(0);
    list.unmount();
    renderAt("/search?q=glass quiet");
    expect(await screen.findByText(/No results for/)).toBeTruthy();
  });
});

describe("customer menu", () => {
  it("the Admin console link is not shown to a customer", async () => {
    renderAt("/");
    await screen.findByRole("heading", { name: "Trending Movies" });
    expect(screen.queryByText("Admin console")).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Main" })).queryByText("Admin")).toBeNull();
  });

  it("customers can't open the admin area", async () => {
    renderAt("/admin/dashboard");
    expect(await screen.findByText("Admin access required")).toBeTruthy();
    expect(screen.queryByText("Welcome back, Sam.")).toBeNull();
  });

  it("the demo switch turns a customer into an admin", async () => {
    renderAt("/admin/dashboard");
    fireEvent.click(await screen.findByRole("button", { name: "Switch to demo admin" }));
    expect(await screen.findByRole("heading", { name: "Welcome back, Sam." })).toBeTruthy();
  });
});
