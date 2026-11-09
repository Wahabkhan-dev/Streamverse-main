/**
 * The colour a customer picks on their Profile. It is the avatar colour and the colour of the whole app (buttons, links,
 * highlights, focus rings, charts): choosing one swaps the theme's "primary" tokens, so every screen follows without each
 * component knowing about it. The first colour is StreamVerse red, the stylesheet's own value, so choosing it removes the overrides.
 */
export interface Accent {
  name: string;
  primary: string;
  bright: string;
  deep: string;
  /** a lighter shade for small text on dark surfaces (keeps the contrast readable) */
  text: string;
  /** button hover */
  hover: string;
}

const make = (name: string, hue: number, chroma = 0.2, lightness = 0.56): Accent => ({
  name,
  primary: `oklch(${lightness} ${chroma} ${hue})`,
  bright: `oklch(${lightness + 0.06} ${chroma} ${hue})`,
  deep: `oklch(0.37 ${Math.min(chroma, 0.15)} ${hue})`,
  text: `oklch(0.72 ${Math.min(chroma, 0.17)} ${hue})`,
  hover: `oklch(${lightness - 0.06} ${chroma} ${hue})`,
});

export const ACCENTS: Accent[] = [
  { name: "Red", primary: "oklch(0.58 0.235 27.5)", bright: "oklch(0.64 0.24 25)", deep: "oklch(0.37 0.15 27)", text: "oklch(0.66 0.215 25)", hover: "oklch(0.52 0.215 27)" },
  make("Blue", 255),
  make("Green", 155, 0.17, 0.52),
  make("Orange", 50, 0.18, 0.56),
  make("Violet", 295, 0.22),
  make("Pink", 350, 0.22),
];

/** The CSS variables a colour changes. Everything else in the theme is derived from these. */
const TOKENS: Array<[string, keyof Accent]> = [
  ["--primary", "primary"],
  ["--primary-bright", "bright"],
  ["--primary-deep", "deep"],
  ["--primary-text", "text"],
  ["--primary-hover", "hover"],
  ["--ring", "primary"],
  ["--chart-1", "primary"],
  ["--sidebar-primary", "primary"],
  ["--sidebar-ring", "primary"],
];

export const accentAt = (index: number): Accent => ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]!;

/** The avatar background for a colour: its own gradient, independent of the theme. */
export const accentGradient = (index: number) => {
  const a = accentAt(index);
  return `linear-gradient(135deg, ${a.primary}, ${a.deep})`;
};

/** Makes the whole app use colour number `index` (0 = back to the stylesheet's red). Safe to call before the page exists. */
export function applyAccent(index: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const a = accentAt(index);
  for (const [prop, key] of TOKENS) {
    if (index === 0) root.style.removeProperty(prop);
    else root.style.setProperty(prop, a[key]);
  }
  root.dataset["accent"] = a.name.toLowerCase();
}
