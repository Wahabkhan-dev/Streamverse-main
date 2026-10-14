/** Admins publish directly: there is no approval workflow. */
export const CONTENT_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED", "PROCESSING", "PROCESSING_FAILED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const LEGAL_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];
