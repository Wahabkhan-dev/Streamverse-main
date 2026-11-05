import { describe, expect, it } from "vitest";
import type { ApiHomeSection, ApiHomeSectionItem } from "@/api/types";
import { planSectionSave, savedAsManual } from "@/lib/homepageSave";

const item = (id: string): ApiHomeSectionItem => ({ contentId: id, contentType: "movie", position: 0, slug: id, title: id, image: null });
const section = (over: Partial<ApiHomeSection>): ApiHomeSection => ({ id: "s1", key: "trending", displayTitle: "Trending", type: "TRENDING", contentType: "MOVIE", enabled: true, displayOrder: 0, itemLimit: 12, items: [], ...over });
const local = (mode: "auto" | "manual", ids: string[], extra: { autoFlag?: "featured" | "newRelease" | "trending" | "popular" } = {}) => ({ id: "trending", mode, items: ids.map((id) => ({ id })), ...extra });

/** Admin -> Homepage: what Save has to send so Manual and the picked titles survive a reload. */
describe("saving a homepage section's mode and titles", () => {
  it("Automatic -> Manual with picks: change the type to MANUAL, add each pick, set the order", () => {
    const plan = planSectionSave(local("manual", ["a", "b"]), section({}));
    expect(plan.type).toBe("MANUAL");
    expect(plan.add).toEqual([{ contentId: "a", displayOrder: 0 }, { contentId: "b", displayOrder: 1 }]);
    expect(plan.order).toEqual([{ contentId: "a", displayOrder: 0 }, { contentId: "b", displayOrder: 1 }]);
    expect(plan.remove).toEqual([]);
  });

  it("nothing changed on a Manual section: nothing to send", () => {
    const plan = planSectionSave(local("manual", ["a", "b"]), section({ type: "MANUAL", contentType: null, items: [item("a"), item("b")] }));
    expect(plan).toEqual({ add: [], remove: [], order: null, unsaveable: 0 });
  });

  it("a Manual section with one title swapped and reordered: remove, add, then order", () => {
    const plan = planSectionSave(local("manual", ["c", "b"]), section({ type: "MANUAL", contentType: null, items: [item("a"), item("b")] }));
    expect(plan.type).toBeUndefined();
    expect(plan.remove).toEqual(["a"]);
    expect(plan.add).toEqual([{ contentId: "c", displayOrder: 0 }]);
    expect(plan.order).toEqual([{ contentId: "c", displayOrder: 0 }, { contentId: "b", displayOrder: 1 }]);
  });

  it("only reordering: just the order", () => {
    const plan = planSectionSave(local("manual", ["b", "a"]), section({ type: "MANUAL", contentType: null, items: [item("a"), item("b")] }));
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.order).toEqual([{ contentId: "b", displayOrder: 0 }, { contentId: "a", displayOrder: 1 }]);
  });

  it("Manual -> Automatic: back to an automatic type, with the catalog the server requires", () => {
    const plan = planSectionSave(local("auto", [], { autoFlag: "popular" }), section({ key: "picks", type: "MANUAL", contentType: null, items: [item("a")] }));
    expect(plan.type).toBe("POPULAR");
    expect(plan.contentType).toBe("MOVIE");
    expect(plan.add).toEqual([]);
  });

  it("Manual -> Automatic with no flag chosen picks one that fits the section's name", () => {
    expect(planSectionSave(local("auto", []), section({ key: "trending_now", type: "MANUAL", contentType: null })).type).toBe("TRENDING");
    expect(planSectionSave(local("auto", []), section({ key: "new_releases", type: "MANUAL", contentType: null })).type).toBe("NEW_RELEASE");
    expect(planSectionSave(local("auto", []), section({ key: "staff_picks", type: "MANUAL", contentType: null })).type).toBe("FEATURED");
  });

  it("an Automatic section left alone sends nothing", () => {
    expect(planSectionSave(local("auto", []), section({}))).toEqual({ add: [], remove: [], order: null, unsaveable: 0 });
  });

  it("the hero keeps its type: it is Manual when it has picks, and going Automatic removes them", () => {
    const hero = section({ key: "hero", type: "HERO", contentType: null, items: [item("a")] });
    expect(savedAsManual(hero)).toBe(true);
    expect(savedAsManual(section({ key: "hero", type: "HERO", contentType: null, items: [] }))).toBe(false);
    const toManual = planSectionSave({ id: "hero", mode: "manual", items: [{ id: "a" }, { id: "z" }] }, hero);
    expect(toManual.type).toBeUndefined();
    expect(toManual.add).toEqual([{ contentId: "z", displayOrder: 1 }]);
    const toAuto = planSectionSave({ id: "hero", mode: "auto", items: [] }, hero);
    expect(toAuto.type).toBeUndefined();
    expect(toAuto.remove).toEqual(["a"]);
  });

  it("picks without a content id are reported, not silently dropped", () => {
    const plan = planSectionSave({ id: "trending", mode: "manual", items: [{ id: "a" }, {}] }, section({}));
    expect(plan.unsaveable).toBe(1);
  });
});
