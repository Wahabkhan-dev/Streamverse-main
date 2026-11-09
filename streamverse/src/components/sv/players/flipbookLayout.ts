/** Below this reading-area width a spread would make the pages too small to read, so phones and narrow windows show one page. */
export const SPREAD_MIN_WIDTH = 720;
/** A4-ish until the first page tells the real shape: the stage is reserved at this shape while loading, so it barely changes size afterwards. */
export const DEFAULT_RATIO = 0.707;

export interface FlipLayout {
  /** two pages side by side (otherwise one) */
  spread: boolean;
  /** whether the reading area is wide enough to offer the spread at all */
  canSpread: boolean;
  pageW: number;
  pageH: number;
  /** the width of the whole book on screen */
  bookW: number;
}

/**
 * The size of the book for the reading area. Everything is worked out here, up front, from the area and the page shape, so the
 * stage has its final size before the first page is drawn and nothing jumps while pages load or turn.
 * `ratio` is page width / height; `zoom` is a multiplier (1 = the book fits the area).
 */
export function flipLayout(o: { availW: number; availH: number; ratio: number; wantSpread: boolean; zoom?: number }): FlipLayout {
  const canSpread = o.availW >= SPREAD_MIN_WIDTH;
  const spread = o.wantSpread && canSpread;
  const cols = spread ? 2 : 1;
  const ratio = o.ratio > 0 ? o.ratio : DEFAULT_RATIO;
  const fit = Math.min(Math.max(o.availW, 1) / cols, Math.max(o.availH, 1) * ratio);
  const pageW = Math.max(1, Math.floor(fit * (o.zoom ?? 1)));
  return { spread, canSpread, pageW, pageH: Math.max(1, Math.round(pageW / ratio)), bookW: pageW * cols };
}

/**
 * Which page(s) are showing. `index` is the page the book reports (0-based). With a cover, the first spread is the cover alone,
 * then pages come in pairs (2-3, 4-5, ...) and a last page left over is shown alone.
 */
export function pageLabel(index: number, total: number, spread: boolean): string {
  const first = index + 1;
  if (!spread || index === 0 || first >= total) return `Page ${first} / ${total}`;
  return `Pages ${first}–${first + 1} / ${total}`;
}
