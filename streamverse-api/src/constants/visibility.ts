export const VISIBILITIES = ["PUBLIC", "SUBSCRIBERS_ONLY", "HIDDEN"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
