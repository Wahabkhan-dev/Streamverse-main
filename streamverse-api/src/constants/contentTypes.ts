export const CONTENT_TYPES = ["MOVIE", "EBOOK", "AUDIOBOOK"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Prefix of the server-generated, never-reused content code (MOV-000001, EBK-000001, AUD-000001). */
export const CONTENT_CODE_PREFIX: Record<ContentType, string> = { MOVIE: "MOV", EBOOK: "EBK", AUDIOBOOK: "AUD" };
