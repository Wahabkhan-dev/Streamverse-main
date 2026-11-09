import { expect, it } from "vitest";
import { DEFAULT_RATIO, SPREAD_MIN_WIDTH, flipLayout, pageLabel } from "@/components/sv/players/flipbookLayout";

const A4 = 0.707;

it("a large screen shows a double-page spread by default, and the whole book fits the reading area", () => {
  const l = flipLayout({ availW: 1400, availH: 800, ratio: A4, wantSpread: true });
  expect(l.spread).toBe(true);
  expect(l.bookW).toBe(l.pageW * 2);
  expect(l.bookW).toBeLessThanOrEqual(1400);
  expect(l.pageH).toBeLessThanOrEqual(800);
  // height is the limit here: the pages are as tall as the area
  expect(l.pageH).toBeGreaterThanOrEqual(799);
});

it("the single-page choice on a large screen shows one bigger page", () => {
  const double = flipLayout({ availW: 1400, availH: 800, ratio: A4, wantSpread: true });
  const single = flipLayout({ availW: 1400, availH: 800, ratio: A4, wantSpread: false });
  expect(single.spread).toBe(false);
  expect(single.canSpread).toBe(true);
  expect(single.bookW).toBe(single.pageW);
  expect(single.pageH).toBeLessThanOrEqual(800);
  expect(single.pageW).toBeGreaterThanOrEqual(double.pageW);
});

it("phones and narrow windows always show one page, and the choice is not offered", () => {
  const phone = flipLayout({ availW: 360, availH: 600, ratio: A4, wantSpread: true });
  expect(phone.spread).toBe(false);
  expect(phone.canSpread).toBe(false);
  expect(phone.bookW).toBeLessThanOrEqual(360);
  const edge = flipLayout({ availW: SPREAD_MIN_WIDTH - 1, availH: 900, ratio: A4, wantSpread: true });
  expect(edge.spread).toBe(false);
  expect(flipLayout({ availW: SPREAD_MIN_WIDTH, availH: 900, ratio: A4, wantSpread: true }).spread).toBe(true);
});

it("zoom makes the book itself bigger (nothing is scaled after the fact), and the size never depends on loading state", () => {
  const one = flipLayout({ availW: 1000, availH: 700, ratio: A4, wantSpread: true, zoom: 1 });
  const two = flipLayout({ availW: 1000, availH: 700, ratio: A4, wantSpread: true, zoom: 2 });
  expect(two.pageW).toBeGreaterThanOrEqual(one.pageW * 2 - 1);
  // same inputs, same size, every time: nothing to jump
  expect(flipLayout({ availW: 1000, availH: 700, ratio: A4, wantSpread: true })).toEqual(one);
  // before the first page is known the stage is reserved at a default page shape
  expect(flipLayout({ availW: 1000, availH: 700, ratio: 0, wantSpread: true })).toEqual(flipLayout({ availW: 1000, availH: 700, ratio: DEFAULT_RATIO, wantSpread: true }));
});

it("a wide, short page (landscape PDF) still fits", () => {
  const l = flipLayout({ availW: 1200, availH: 700, ratio: 1.4, wantSpread: true });
  expect(l.bookW).toBeLessThanOrEqual(1200);
  expect(l.pageH).toBeLessThanOrEqual(700);
});

it("says which pages are showing", () => {
  expect(pageLabel(0, 20, true)).toBe("Page 1 / 20");
  expect(pageLabel(1, 20, true)).toBe("Pages 2–3 / 20");
  expect(pageLabel(19, 20, true)).toBe("Page 20 / 20");
  expect(pageLabel(5, 20, false)).toBe("Page 6 / 20");
});
