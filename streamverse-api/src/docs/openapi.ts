/**
 * OpenAPI 3.0 description of the API. Phase 1 documented the foundation (health, readiness, the shared
 * response/error shapes). Phase 2 adds authentication, session and profile routes. Every later phase adds
 * its paths here as the routes are built. No real secrets ever go in an example value below.
 */
const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } });
const authBearer = [{ bearerAuth: [] }];
const jsonBody = (schema: { $ref: string }) => ({ required: true, content: { "application/json": { schema } } });
const authResultResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResultResponse" } } } });

// Every /api/v1/admin/* route shares the same auth requirement and error shapes (Section 2/74) — these
// helpers describe one route at a time without repeating that boilerplate for ~60 near-identical paths.
const adminGet = (tag: string, summary: string) => ({ tags: [tag], summary, security: authBearer, responses: { "200": { description: "OK" }, "401": errorResponse("Authentication required"), "403": errorResponse("ADMIN only"), "404": errorResponse("Not found") } });
const adminPost = (tag: string, summary: string) => ({
  tags: [tag],
  summary,
  security: authBearer,
  responses: { "200": { description: "OK" }, "201": { description: "Created" }, "400": errorResponse("Validation failed"), "401": errorResponse("Authentication required"), "403": errorResponse("ADMIN only"), "404": errorResponse("Not found"), "409": errorResponse("Conflict (duplicate, stale update, or invalid status transition)") },
});
const adminDelete = (tag: string, summary: string) => ({ tags: [tag], summary, security: authBearer, responses: { "200": { description: "OK" }, "401": errorResponse("Authentication required"), "403": errorResponse("ADMIN only"), "404": errorResponse("Not found"), "409": errorResponse("Still in use") } });

/**
 * One content type's full route family (Section 4–24): list/create, get/update/delete, the five status
 * actions, and — where that type has them — editions and chapters. Builds the same shape movie/ebook/
 * audiobook routes actually expose, so this never drifts from the real route files.
 */
function buildAdminContentPaths(segment: string, tag: string, noun: string, has: { editions: boolean; chapters: boolean }) {
  const base = `/api/v1/admin/${segment}`;
  const paths: Record<string, unknown> = {
    [base]: { get: adminGet(tag, `List ${segment}`), post: adminPost(tag, `Create a title-only (or more complete) ${noun} draft`) },
    [`${base}/{id}`]: {
      get: adminGet(tag, `Full admin edit payload for one ${noun}`),
      put: adminPost(tag, "Partial update — same semantics as PATCH (Section 46/47); only fields sent are changed, relation arrays sent REPLACE the current selection"),
      patch: adminPost(tag, "Partial update"),
      delete: adminDelete(tag, "Soft delete — sets deletedAt; the contentCode is never freed for reuse"),
    },
    [`${base}/{id}/publish`]: { post: adminPost(tag, "Validates publish-readiness (400 with field errors if incomplete), then DRAFT/SCHEDULED/UNPUBLISHED -> PUBLISHED") },
    [`${base}/{id}/unpublish`]: { post: adminPost(tag, "PUBLISHED/SCHEDULED -> UNPUBLISHED") },
    [`${base}/{id}/archive`]: { post: adminPost(tag, "PUBLISHED/UNPUBLISHED -> ARCHIVED (terminal)") },
    [`${base}/{id}/schedule`]: { post: adminPost(tag, "DRAFT -> SCHEDULED with a future publishAt") },
    [`${base}/{id}/cancel-schedule`]: { post: adminPost(tag, "SCHEDULED -> DRAFT") },
  };
  if (has.editions) {
    paths[`${base}/{id}/editions`] = { post: adminPost(tag, "Add a translated/narrated edition for another language") };
    paths[`${base}/{id}/editions/{editionId}`] = { put: adminPost(tag, "Update an edition"), delete: adminDelete(tag, "Delete an edition") };
  }
  if (has.chapters) {
    paths[`${base}/{id}/chapters`] = { post: adminPost(tag, "Add a chapter (chapterNumber must be unique per audiobook)") };
    paths[`${base}/{id}/chapters/reorder`] = { put: adminPost(tag, "Reorder chapters, identified by id") };
    paths[`${base}/{id}/chapters/{chapterId}`] = { put: adminPost(tag, "Update a chapter"), delete: adminDelete(tag, "Delete a chapter") };
  }
  return paths;
}

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "StreamVerse API",
    version: "0.2.0",
    description:
      "Backend for StreamVerse. Two roles only: USER and ADMIN. All production endpoints live under /api/v1. " +
      "Auth: a short-lived JWT access token is returned in the response body and sent as `Authorization: Bearer <token>`; " +
      "a rotating refresh token is set as an httpOnly cookie (`sv_refresh_token`, path `/api/v1/auth`) and is never " +
      "readable from JavaScript or sent in the body. ADMIN accounts cannot be created through the API — see README.",
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "System", description: "Liveness and readiness" },
    { name: "Auth", description: "Register, login, session refresh/logout, password reset and change" },
    { name: "Me", description: "The authenticated user's own profile" },
    { name: "Admin Movies", description: "ADMIN-only. Draft/publish lifecycle, metadata, cast/crew, captions, audio tracks" },
    { name: "Admin eBooks", description: "ADMIN-only. Draft/publish lifecycle, metadata, translated editions" },
    { name: "Admin Audiobooks", description: "ADMIN-only. Draft/publish lifecycle, metadata, chapters, narrator editions" },
    { name: "Admin Drafts", description: "ADMIN-only. Every DRAFT title, across all three content types, in one list" },
    { name: "Admin Genres", description: "ADMIN-only. Genre taxonomy — renaming/deactivating never breaks a content relationship" },
    { name: "Admin Tags", description: "ADMIN-only. Normalized tag list" },
    { name: "Admin Languages", description: "ADMIN-only. The seeded language list" },
    { name: "Admin Collections", description: "ADMIN-only. Curated title groups and their items" },
    { name: "Admin Homepage", description: "ADMIN-only. Homepage sections (manual or dynamic) and their items" },
    { name: "Admin Banners", description: "ADMIN-only. Hero/Normal/Latest Release/Promotional banners" },
    { name: "Admin Legal", description: "ADMIN-only. Privacy Policy / Terms & Conditions / Refund Policy draft and publish" },
    { name: "Admin Settings", description: "ADMIN-only. Known, validated app settings" },
    { name: "Admin Uploads", description: "ADMIN-only. Presigned uploads, multipart uploads, and upload status (Phase 6)" },
    { name: "Admin Media", description: "ADMIN-only. Media asset lifecycle: list, delete, retry processing (Phase 6)" },
    { name: "Media Access", description: "Protected playback/access authorization for eligible, authenticated customers (Phase 6)" },
    { name: "Plans", description: "Public pricing list (Phase 7)" },
    { name: "Admin Plans", description: "ADMIN-only. Links a Plan to a Stripe Price; deactivate rather than delete" },
    { name: "Billing", description: "The authenticated user's own subscription, payment methods and billing history (Phase 7)" },
    { name: "Admin Billing", description: "ADMIN-only. Subscriptions, payments, refunds and Stripe reconciliation" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Liveness",
        description: "Returns 200 while the process is running. Does not touch the database.",
        security: [],
        responses: { "200": { description: "Running", content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } } } },
      },
    },
    "/ready": {
      get: {
        tags: ["System"],
        summary: "Readiness",
        description: "Returns 200 when dependencies (the database) are reachable, otherwise 503. Never includes connection details.",
        security: [],
        responses: {
          "200": { description: "Ready", content: { "application/json": { schema: { $ref: "#/components/schemas/ReadyResponse" } } } },
          "503": errorResponse("A dependency is unavailable"),
        },
      },
    },
    "/api/v1/health": { get: { tags: ["System"], summary: "Liveness (versioned alias)", security: [], responses: { "200": { description: "Running" } } } },
    "/api/v1/ready": { get: { tags: ["System"], summary: "Readiness (versioned alias)", security: [], responses: { "200": { description: "Ready" }, "503": errorResponse("A dependency is unavailable") } } },

    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        description: "Public registration. Always creates role USER, status ACTIVE — the request body cannot specify a role.",
        security: [],
        requestBody: jsonBody({ $ref: "#/components/schemas/RegisterRequest" }),
        responses: { "201": authResultResponse("Account created"), "400": errorResponse("Validation failed"), "409": errorResponse("An account with this email already exists.") },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        description: "Rate limited. Returns the same generic error for an unknown email, a wrong password, or a non-ACTIVE account.",
        security: [],
        requestBody: jsonBody({ $ref: "#/components/schemas/LoginRequest" }),
        responses: { "200": authResultResponse("Logged in"), "401": errorResponse("Invalid email or password."), "429": errorResponse("Too many attempts") },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh",
        description:
          "Rotates the refresh token: the `sv_refresh_token` cookie is read, revoked, and replaced with a new one in the response. " +
          "Presenting a token that was already rotated (or logged out) revokes every session for that account (reuse = theft).",
        security: [],
        responses: { "200": authResultResponse("Session refreshed"), "401": errorResponse("Invalid, expired or already-used session") },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Revokes the session named by the refresh cookie (if any) and clears the cookie. Always 200, even with no session.",
        security: [],
        responses: { "200": { description: "Logged out" } },
      },
    },
    "/api/v1/auth/logout-all": {
      post: { tags: ["Auth"], summary: "Logout of every device", security: authBearer, responses: { "200": { description: "Every session revoked" }, "401": errorResponse("Authentication required") } },
    },
    "/api/v1/auth/me": {
      get: { tags: ["Auth"], summary: "Current user", security: authBearer, responses: { "200": { description: "Current user", content: { "application/json": { schema: { $ref: "#/components/schemas/SafeUserResponse" } } } }, "401": errorResponse("Authentication required") } },
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset",
        description: "Always returns the same generic message, whether or not the email has an account — this never reveals which.",
        security: [],
        requestBody: jsonBody({ $ref: "#/components/schemas/ForgotPasswordRequest" }),
        responses: { "200": { description: "If an account exists for that email, password reset instructions have been sent." } },
      },
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset a password with a token",
        description: "The token is single-use and expires. Succeeding revokes every session for the account; no new session is issued.",
        security: [],
        requestBody: jsonBody({ $ref: "#/components/schemas/ResetPasswordRequest" }),
        responses: { "200": { description: "Password reset" }, "400": errorResponse("This reset link is invalid or has expired.") },
      },
    },
    "/api/v1/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change password while logged in",
        description: "Revokes every session for the account, including the one making this request — the caller must log in again.",
        security: authBearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/ChangePasswordRequest" }),
        responses: { "200": { description: "Password changed" }, "401": errorResponse("Current password is incorrect.") },
      },
    },

    "/api/v1/me/profile": {
      get: { tags: ["Me"], summary: "Get my profile", security: authBearer, responses: { "200": { description: "Profile", content: { "application/json": { schema: { $ref: "#/components/schemas/SafeUserResponse" } } } }, "401": errorResponse("Authentication required") } },
      patch: {
        tags: ["Me"],
        summary: "Update my profile",
        description: "Only display/preference fields. role, status, emailVerified and email cannot be changed here, even if sent.",
        security: authBearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/ProfileUpdateRequest" }),
        responses: { "200": { description: "Profile updated" }, "400": errorResponse("Validation failed"), "401": errorResponse("Authentication required") },
      },
    },

    ...buildAdminContentPaths("movies", "Admin Movies", "movie", { editions: false, chapters: false }),
    ...buildAdminContentPaths("ebooks", "Admin eBooks", "ebook", { editions: true, chapters: false }),
    ...buildAdminContentPaths("audiobooks", "Admin Audiobooks", "audiobook", { editions: true, chapters: true }),

    "/api/v1/admin/drafts": { get: adminGet("Admin Drafts", "Every DRAFT title across movies/eBooks/audiobooks, filterable by type and search") },

    "/api/v1/admin/genres": { get: adminGet("Admin Genres", "List genres"), post: adminPost("Admin Genres", "Create a genre") },
    "/api/v1/admin/genres/{id}": {
      put: adminPost("Admin Genres", "Rename/deactivate a genre — relationships keep pointing at the same id"),
      delete: adminDelete("Admin Genres", "Refused (409) while any title still uses this genre"),
    },

    "/api/v1/admin/tags": { get: adminGet("Admin Tags", "List tags"), post: adminPost("Admin Tags", "Find-or-create a normalized tag") },
    "/api/v1/admin/languages": { get: adminGet("Admin Languages", "List languages, including inactive"), post: adminPost("Admin Languages", "Add a language (rare — languages are normally seeded)") },

    "/api/v1/admin/collections": { get: adminGet("Admin Collections", "List collections"), post: adminPost("Admin Collections", "Create a collection") },
    "/api/v1/admin/collections/{id}": {
      get: adminGet("Admin Collections", "Collection with its items"),
      put: adminPost("Admin Collections", "Update a collection"),
      delete: adminDelete("Admin Collections", "Archives the collection (status = ARCHIVED) — never hard-deleted"),
    },
    "/api/v1/admin/collections/{id}/items": { post: adminPost("Admin Collections", "Add a title by contentId (409 if already present)") },
    "/api/v1/admin/collections/{id}/items/reorder": { put: adminPost("Admin Collections", "Reorder items, identified by contentId") },
    "/api/v1/admin/collections/{id}/items/{contentId}": { delete: adminDelete("Admin Collections", "Remove a title from the collection") },

    "/api/v1/admin/homepage/sections": { get: adminGet("Admin Homepage", "List sections"), post: adminPost("Admin Homepage", "Create a section (key is permanent)") },
    "/api/v1/admin/homepage/sections/reorder": { put: adminPost("Admin Homepage", "Reorder sections, identified by id") },
    "/api/v1/admin/homepage/sections/{id}": { put: adminPost("Admin Homepage", "Update a section — key cannot be sent here, ever"), delete: adminDelete("Admin Homepage", "Delete a section and its items") },
    "/api/v1/admin/homepage/sections/{id}/items": { get: adminGet("Admin Homepage", "List a section's items"), post: adminPost("Admin Homepage", "Add a title by contentId (409 if already present)") },
    "/api/v1/admin/homepage/sections/{id}/items/reorder": { put: adminPost("Admin Homepage", "Reorder items, identified by contentId") },
    "/api/v1/admin/homepage/sections/{id}/items/{contentId}": { delete: adminDelete("Admin Homepage", "Remove a title from the section") },

    "/api/v1/admin/banners": { get: adminGet("Admin Banners", "List banners"), post: adminPost("Admin Banners", "Create a banner (startsAt must be before endsAt; linkedContentId must exist)") },
    "/api/v1/admin/banners/{id}": { get: adminGet("Admin Banners", "Get a banner"), put: adminPost("Admin Banners", "Update a banner"), delete: adminDelete("Admin Banners", "Delete a banner") },

    "/api/v1/admin/legal": { get: adminGet("Admin Legal", "The three documents (Privacy Policy, Terms & Conditions, Refund Policy)") },
    "/api/v1/admin/legal/{type}": { get: adminGet("Admin Legal", "One document: its published and (if any) draft version") },
    "/api/v1/admin/legal/{type}/preview": { get: adminGet("Admin Legal", "The current draft, rendered as customers would see it once published") },
    "/api/v1/admin/legal/{type}/versions": { get: adminGet("Admin Legal", "Full version history, most recent first — nothing is ever deleted") },
    "/api/v1/admin/legal/{type}/draft": { post: adminPost("Admin Legal", "Save a draft — never changes what is currently published"), put: adminPost("Admin Legal", "Same as POST") },
    "/api/v1/admin/legal/{type}/publish": { post: adminPost("Admin Legal", "Publish the current draft; the previously-published version is kept in history") },

    "/api/v1/admin/settings": { get: adminGet("Admin Settings", "All known settings, parsed to their real type"), put: adminPost("Admin Settings", "Batched update: { key: value, ... }") },
    "/api/v1/admin/settings/{key}": { put: adminPost("Admin Settings", "Update one known setting; rejects an unknown key or the wrong value type") },

    "/api/v1/plans": { get: { tags: ["Plans"], summary: "List active, customer-visible plans", security: [], responses: { "200": { description: "Plans" } } } },

    "/api/v1/admin/plans": { get: adminGet("Admin Plans", "List every plan, active or not"), post: adminPost("Admin Plans", "Link a plan to an existing Stripe Price (Section 11) — amounts are stored locally, never recomputed from Stripe on every read") },
    "/api/v1/admin/plans/{id}": { get: adminGet("Admin Plans", "Get a plan"), put: adminPost("Admin Plans", "Update a plan; set active=false to retire it — never hard-deleted while referenced") },

    "/api/v1/me/subscription": { get: { tags: ["Billing"], summary: "My subscription status", security: authBearer, responses: { "200": { description: "Subscription (or a 'no subscription' shape)" }, "401": errorResponse("Authentication required") } } },
    "/api/v1/me/subscription/checkout": {
      post: {
        tags: ["Billing"],
        summary: "Start a Stripe Checkout session for a plan",
        description: "Body: { planId }. Price/currency/amount are never accepted from the client — resolved server-side from the Plan row. Refused (409) if already actively subscribed.",
        security: authBearer,
        responses: { "201": { description: "{ checkoutUrl, sessionId }" }, "400": errorResponse("Unknown or inactive plan"), "401": errorResponse("Authentication required"), "409": errorResponse("Already actively subscribed") },
      },
    },
    "/api/v1/me/subscription/cancel": { post: { tags: ["Billing"], summary: "Cancel at period end", security: authBearer, responses: { "200": { description: "Updated subscription" }, "401": errorResponse("Authentication required"), "409": errorResponse("Nothing to cancel") } } },
    "/api/v1/me/subscription/resume": { post: { tags: ["Billing"], summary: "Resume a subscription scheduled for cancellation", security: authBearer, responses: { "200": { description: "Updated subscription" }, "409": errorResponse("Not scheduled for cancellation, or the period already ended") } } },
    "/api/v1/me/subscription/change-plan": {
      post: {
        tags: ["Billing"],
        summary: "Upgrade/downgrade to another active plan",
        description: "Body: { planId }. Proration policy is explicit (create_prorations) — see README.",
        security: authBearer,
        responses: { "200": { description: "Updated subscription" }, "409": errorResponse("Already on this plan, or no active subscription to change") },
      },
    },
    "/api/v1/me/billing-portal": { post: { tags: ["Billing"], summary: "Create a Stripe-hosted Billing Portal session", security: authBearer, responses: { "200": { description: "{ url }" } } } },

    "/api/v1/me/payment-methods/setup": { post: { tags: ["Billing"], summary: "Create a SetupIntent for Stripe Elements", description: "Never accepts a raw card number — the frontend confirms the SetupIntent with Stripe Elements using the returned clientSecret.", security: authBearer, responses: { "201": { description: "{ clientSecret }" } } } },
    "/api/v1/me/payment-methods": { get: { tags: ["Billing"], summary: "List my payment methods", description: "Safe display fields only (brand/last4/expiry/isDefault) — never full card data.", security: authBearer, responses: { "200": { description: "Payment methods" } } } },
    "/api/v1/me/payment-methods/{id}/default": { post: { tags: ["Billing"], summary: "Set a payment method as default", security: authBearer, responses: { "200": { description: "Updated list" }, "403": errorResponse("Not your payment method") } } },
    "/api/v1/me/payment-methods/{id}": {
      delete: {
        tags: ["Billing"],
        summary: "Remove a payment method",
        description: "409 if this is the default AND last method AND an active/trialing subscription needs one — add another method first.",
        security: authBearer,
        responses: { "200": { description: "Updated list" }, "403": errorResponse("Not your payment method"), "409": errorResponse("Add another payment method before removing this one") },
      },
    },

    "/api/v1/me/payments": { get: { tags: ["Billing"], summary: "My billing history", security: authBearer, responses: { "200": { description: "Paginated payments" } } } },

    "/api/v1/admin/subscriptions": { get: adminGet("Admin Billing", "List subscriptions — filter by status/plan/search, paginated") },
    "/api/v1/admin/subscriptions/{id}": { get: adminGet("Admin Billing", "Subscription detail: user, plan, Stripe ids as internal references, status, period, cancel state") },
    "/api/v1/admin/payments": { get: adminGet("Admin Billing", "List payments — filter by status/currency/user/date, paginated") },
    "/api/v1/admin/payments/summary": { get: adminGet("Admin Billing", "Totals/succeeded/pending/failed/refunded/revenue — all derived live from Payment rows") },
    "/api/v1/admin/payments/{id}": { get: adminGet("Admin Billing", "Verified payment detail, including its refunds") },
    "/api/v1/admin/payments/{id}/refund": { post: adminPost("Admin Billing", "Full (amount omitted) or partial refund via the Stripe Refund API. Validates the remaining refundable amount server-side.") },
    "/api/v1/admin/billing/reconcile/{userId}": { post: adminPost("Admin Billing", "Internal: re-pulls this user's subscription from Stripe and re-syncs the local row. Not for routine use — webhooks keep state current.") },

    "/api/v1/admin/uploads/presign": {
      post: adminPost(
        "Admin Uploads",
        "Validates purpose/content-type/MIME/size, creates a PENDING MediaAsset, and returns a short-lived signed PUT URL. Never returns the underlying storageKey.",
      ),
    },
    "/api/v1/admin/uploads/{assetId}/complete": {
      post: adminPost("Admin Uploads", "Verifies the object actually landed in storage (HEAD + magic-byte/structure checks), then marks it UPLOADED/READY and enqueues processing if needed. Idempotent."),
    },
    "/api/v1/admin/uploads/{assetId}/abort": { post: adminPost("Admin Uploads", "Cancels a pending/uploading asset: best-effort object delete, no orphan row left behind. Refused once READY.") },
    "/api/v1/admin/uploads/{assetId}/status": { get: adminGet("Admin Uploads", "Pollable upload/processing status. Never includes the storage key.") },
    "/api/v1/admin/uploads/multipart/initiate": { post: adminPost("Admin Uploads", "Opens an S3-compatible multipart upload for a large file (e.g. a movie master).") },
    "/api/v1/admin/uploads/multipart/{uploadId}/part": { post: adminPost("Admin Uploads", "Returns a signed PUT URL for one part number.") },
    "/api/v1/admin/uploads/multipart/{uploadId}/complete": { post: adminPost("Admin Uploads", "Completes the multipart upload given the client-collected {partNumber, etag} list.") },
    "/api/v1/admin/uploads/multipart/{uploadId}": { delete: adminDelete("Admin Uploads", "Aborts an in-progress multipart upload.") },

    "/api/v1/admin/content/{contentId}/media": { get: adminGet("Admin Media", "Every media asset attached/uploaded for this content row, with status/dimensions/duration — never a storage secret.") },
    "/api/v1/admin/content/{contentId}/media/{assetId}/attach": { post: adminPost("Admin Media", "Checks (without changing anything) whether this asset could be attached to this content — the actual slot wiring happens through the usual PUT .../movies/{id} etc.") },
    "/api/v1/admin/media/{assetId}": { delete: adminDelete("Admin Media", "Soft-deletes the asset and queues physical cleanup. Refused (409) while still attached to PUBLISHED content.") },
    "/api/v1/admin/media/{assetId}/retry-processing": { post: adminPost("Admin Media", "Re-enqueues video/audio processing for a FAILED asset.") },

    "/api/v1/media/movies/{contentId}/playback": {
      post: {
        tags: ["Media Access"],
        summary: "Authorize movie playback",
        description: "Requires login. Runs the same access rules as every other customer read, then returns a short-lived signed HLS manifest URL — only when eligible AND processed. Never returns a storage key or a permanent URL.",
        security: authBearer,
        responses: { "200": { description: "Access result (and a signed URL when eligible and ready)" }, "401": errorResponse("Authentication required"), "404": errorResponse("Not found") },
      },
    },
    "/api/v1/media/audiobooks/{contentId}/playback": {
      post: {
        tags: ["Media Access"],
        summary: "Authorize audiobook playback",
        description: "Requires login. Single-file or per-chapter signed URLs, depending on the audiobook's delivery mode.",
        security: authBearer,
        responses: { "200": { description: "Access result (and signed URL(s) when eligible and ready)" }, "401": errorResponse("Authentication required"), "404": errorResponse("Not found") },
      },
    },
    "/api/v1/media/ebooks/{contentId}/access": {
      post: {
        tags: ["Media Access"],
        summary: "Authorize eBook file access",
        description: "Requires login. Returns a signed URL for whichever of EPUB/PDF is READY.",
        security: authBearer,
        responses: { "200": { description: "Access result (and a signed URL when eligible and ready)" }, "401": errorResponse("Authentication required"), "404": errorResponse("Not found") },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Access token from login/register/refresh. Short-lived; use /api/v1/auth/refresh to renew." },
    },
    schemas: {
      SuccessEnvelope: {
        type: "object",
        required: ["success", "message", "data"],
        properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "OK" }, data: {} },
      },
      FieldError: { type: "object", required: ["path", "message"], properties: { path: { type: "string", example: "body.email" }, message: { type: "string" } } },
      ErrorResponse: {
        type: "object",
        required: ["success", "message", "errors"],
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Validation failed" },
          errors: { type: "array", items: { $ref: "#/components/schemas/FieldError" } },
          code: { type: "string", example: "VALIDATION_FAILED" },
          requestId: { type: "string", format: "uuid" },
        },
      },
      Pagination: {
        type: "object",
        required: ["page", "limit", "total", "totalPages"],
        properties: { page: { type: "integer", example: 1 }, limit: { type: "integer", example: 20 }, total: { type: "integer", example: 100 }, totalPages: { type: "integer", example: 5 } },
      },
      HealthResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: { type: "object", properties: { status: { type: "string", example: "ok" }, uptimeSeconds: { type: "integer" }, timestamp: { type: "string", format: "date-time" } } },
        },
      },
      ReadyResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: { type: "object", properties: { ready: { type: "boolean" }, checks: { type: "object", additionalProperties: { type: "string", enum: ["ok", "unavailable"] } } } },
        },
      },

      RegisterRequest: {
        type: "object",
        required: ["email", "password", "fullName"],
        properties: { email: { type: "string", format: "email", example: "alex@example.com" }, password: { type: "string", format: "password", minLength: 8, example: "a-strong-passphrase" }, fullName: { type: "string", example: "Alex Morgan" } },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" } },
      },
      ForgotPasswordRequest: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
      ResetPasswordRequest: {
        type: "object",
        required: ["token", "newPassword"],
        properties: { token: { type: "string", description: "Opaque token from the reset link" }, newPassword: { type: "string", format: "password", minLength: 8 } },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: { currentPassword: { type: "string", format: "password" }, newPassword: { type: "string", format: "password", minLength: 8 } },
      },
      ProfileUpdateRequest: {
        type: "object",
        description: "Every field is optional; only the ones present are changed.",
        properties: {
          fullName: { type: "string" },
          avatarUrl: { type: "string", format: "uri", nullable: true },
          country: { type: "string", minLength: 2, maxLength: 2, example: "US" },
          preferredLanguage: { type: "string", nullable: true },
          subtitleLanguage: { type: "string", nullable: true },
          audioLanguage: { type: "string", nullable: true },
          videoQuality: { type: "string", enum: ["Auto", "SD", "HD", "4K"], nullable: true },
          audiobookSpeed: { type: "number", minimum: 0.5, maximum: 3, nullable: true },
        },
      },
      SafeUser: {
        type: "object",
        description: "Never includes passwordHash or any token/session internals.",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          fullName: { type: "string" },
          avatarUrl: { type: "string", nullable: true },
          role: { type: "string", enum: ["USER", "ADMIN"] },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "DELETED"] },
          emailVerified: { type: "boolean" },
          preferences: {
            type: "object",
            properties: {
              country: { type: "string", nullable: true },
              preferredLanguage: { type: "string", nullable: true },
              subtitleLanguage: { type: "string", nullable: true },
              audioLanguage: { type: "string", nullable: true },
              videoQuality: { type: "string", nullable: true },
              audiobookSpeed: { type: "number", nullable: true },
            },
          },
          createdAt: { type: "string", format: "date-time" },
          lastLoginAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      SafeUserResponse: {
        allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }, { type: "object", properties: { data: { $ref: "#/components/schemas/SafeUser" } } }],
      },
      AuthResultResponse: {
        allOf: [
          { $ref: "#/components/schemas/SuccessEnvelope" },
          {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: { user: { $ref: "#/components/schemas/SafeUser" }, accessToken: { type: "string", description: "Short-lived JWT. Send as Authorization: Bearer <token>." } },
              },
            },
          },
        ],
      },
    },
  },
} as const;
