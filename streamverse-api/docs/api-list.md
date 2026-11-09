# StreamVerse API list

Every endpoint the backend serves, read from the running app's router (not typed by hand), with how much work each one does.

**Total: 233 endpoints.** 68 heavy · 49 medium · 116 light.

| Level | Meaning |
|---|---|
| 🔴 Heavy | Several database queries or a transaction, CPU-heavy work (password hashing, signing many links), or a call to Stripe / R2. These decide how many users the site can take. |
| 🟡 Medium | A few queries or joins, or a write that happens often. |
| 🟢 Light | One small read or write. |

Base URL: `/api/v1` (live: `https://streamverse-main-2.onrender.com/api/v1`).

## The complex APIs that matter for load

These are the heavy endpoints that real visitors call often. They are the ones to load test, in this order.

| # | Endpoint | Why it is heavy |
|---|---|---|
| 1 | `GET /api/v1/movies/:slug (and /ebooks/:slug, /audiobooks/:slug)` | Every title page. Title + related + images + the visitor's subscription, age and country check. |
| 2 | `GET /api/v1/homepage/` | Every homepage visit. Builds every section; cached for 60 s. |
| 3 | `GET /api/v1/search/ and /search/suggestions` | Text search over titles and people; suggestions run while typing and are not cached. |
| 4 | `POST /api/v1/auth/login and /auth/register` | Password hashing is deliberately slow and uses the CPU; many sign-ins at once (e.g. after an announcement) load the server. |
| 5 | `POST /api/v1/auth/refresh` | Every signed-in tab every 15 minutes: 3,000 users = about 3 per second, all writes. |
| 6 | `POST /api/v1/media/movies/:contentId/playback` | Each time someone presses Play: access + device checks + a new session row. |
| 7 | `GET /api/v1/media/hls/:contentId/*` | 2-3 per play; reads the playlist from R2 and signs ~1,200 segment links for a 2-hour movie. |
| 8 | `POST /me/playback-sessions/:id/heartbeat and PUT /me/progress/*` | Every 30 s per person watching, reading or listening: 3,000 viewers = about 200 writes per second. |
| 9 | `GET /api/v1/me/continue, /me/history, /me/library, /me/my-list` | Signed-in home and account pages; joins the user's rows with titles. |
| 10 | `GET /api/v1/me/subscription/` | Loaded on most pages by signed-in users. |

Heavy but rare (admin or billing, few calls, not a load risk): Stripe calls, admin dashboard/analytics (cached), media reconcile, announcements (one row per customer), title save.

## Health & monitoring (6)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/health` | Public | 🟢 Light | No database. Used by Render to check the server is up | Every few seconds (monitor) |
| GET | `/ready` | Public | 🟢 Light | One database ping (+ Redis if set) | Monitor |
| GET | `/metrics` | Signed in | 🟢 Light | Prometheus counters, admin only | Monitor |
| GET | `/api/v1/health` | Public | 🟢 Light | No database. Used by Render to check the server is up | Every few seconds (monitor) |
| GET | `/api/v1/ready` | Public | 🟢 Light | One database ping (+ Redis if set) | Monitor |
| GET | `/api/v1/metrics` | Signed in | 🟢 Light | Prometheus counters, admin only | Monitor |

## Sign-in & accounts (`/auth`) (9)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | 🔴 Heavy | Password hashing (argon2, ~50-100 ms of CPU) + user, session and verification-email rows | Once per new customer |
| POST | `/api/v1/auth/login` | Public | 🔴 Heavy | Password hashing (argon2, CPU-heavy on purpose) + new session row | Once per sign-in |
| POST | `/api/v1/auth/refresh` | Public | 🟡 Medium | Rotates the refresh token: read + revoke + insert session row | Every 15 min per signed-in tab |
| POST | `/api/v1/auth/logout` | Public | 🟢 Light | Revokes session row(s) | Rare |
| POST | `/api/v1/auth/logout-all` | Signed in | 🟢 Light | Revokes session row(s) | Rare |
| GET | `/api/v1/auth/me` | Signed in | 🟢 Light | One user read | Every page load |
| POST | `/api/v1/auth/forgot-password` | Public | 🔴 Heavy | Password hashing and/or sending an email; revokes sessions | Rare |
| POST | `/api/v1/auth/reset-password` | Public | 🔴 Heavy | Password hashing and/or sending an email; revokes sessions | Rare |
| POST | `/api/v1/auth/change-password` | Signed in | 🔴 Heavy | Password hashing and/or sending an email; revokes sessions | Rare |

## Public catalogue (browse, title pages, homepage, search) (18)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/movies/` | Public | 🟡 Medium | Filtered, paginated list + signed images. Cached in memory | Every browse page |
| GET | `/api/v1/movies/:slug` | Public | 🔴 Heavy | Title + cast/crew/captions + related titles + signed images + the visitor's access (subscription, age, country). Shared part now cached | Every title page |
| GET | `/api/v1/ebooks/` | Public | 🟡 Medium | Filtered, paginated list + signed images. Cached in memory | Every browse page |
| GET | `/api/v1/ebooks/:slug` | Public | 🔴 Heavy | Title + cast/crew/captions + related titles + signed images + the visitor's access (subscription, age, country). Shared part now cached | Every title page |
| GET | `/api/v1/audiobooks/` | Public | 🟡 Medium | Filtered, paginated list + signed images. Cached in memory | Every browse page |
| GET | `/api/v1/audiobooks/:slug` | Public | 🔴 Heavy | Title + cast/crew/captions + related titles + signed images + the visitor's access (subscription, age, country). Shared part now cached | Every title page |
| GET | `/api/v1/homepage/` | Public | 🔴 Heavy | Every homepage section: titles, banners, collections, signed images. Cached in memory (60 s) | Every homepage visit |
| GET | `/api/v1/collections/` | Public | 🟡 Medium | Collections + item counts + cover image. Now cached | Collections page |
| GET | `/api/v1/collections/:slug` | Public | 🟡 Medium | One collection with all its titles | Collection page |
| GET | `/api/v1/banners/` | Public | 🟢 Light | Active banners | Browse pages |
| GET | `/api/v1/genres/` | Public | 🟢 Light | Small list | Most pages |
| GET | `/api/v1/legal/privacy-policy` | Public | 🟢 Light | One published document | Rare |
| GET | `/api/v1/legal/terms-and-conditions` | Public | 🟢 Light | One published document | Rare |
| GET | `/api/v1/legal/refund-policy` | Public | 🟢 Light | One published document | Rare |
| GET | `/api/v1/search/suggestions` | Public | 🔴 Heavy | Text search over titles and people while typing. Not cached | Each pause while typing |
| GET | `/api/v1/search/` | Public | 🔴 Heavy | Text search (LIKE) over titles and people + filters + cards with signed images. Now cached per query | Each search |
| GET | `/api/v1/plans/` | Public | 🟢 Light | Small list | Most pages |
| GET | `/api/v1/settings/public` | Public | 🟢 Light | Public site settings | Every page load |

## Playing media (`/media`) (10)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| POST | `/api/v1/me/playback-sessions/:id/heartbeat` | Signed in | 🟡 Medium | Updates the playback session row. The number of these grows with the number of people watching | Every 30 s per viewer |
| POST | `/api/v1/me/playback-sessions/:id/end` | Signed in | 🟢 Light | Closes the session row | End of each play |
| GET | `/api/v1/media/hls/:contentId/*` | Play token | 🔴 Heavy | Checks the play token + title, reads the playlist from R2 and signs a link for every video segment (a 2-hour movie = ~1,200 signatures) | 2-3 per play (segments themselves go straight to R2) |
| GET | `/api/v1/media/offline-file/:contentId` | Play token | 🟡 Medium | Checks the offline token, redirects to a signed R2 link | Each download |
| POST | `/api/v1/media/movies/:contentId/playback` | Signed in | 🔴 Heavy | Access check (subscription, age, country, device limit) + creates a playback session + signs the play token | Each play |
| POST | `/api/v1/media/movies/:contentId/trailer` | Signed in | 🔴 Heavy | Access check + playback session/signed file link | Each play / open |
| POST | `/api/v1/media/audiobooks/:contentId/playback` | Signed in | 🔴 Heavy | Access check + playback session/signed file link | Each play / open |
| POST | `/api/v1/media/ebooks/:contentId/access` | Signed in | 🔴 Heavy | Access check + playback session/signed file link | Each play / open |
| POST | `/api/v1/media/offline/:contentId/authorize` | Signed in | 🔴 Heavy | Access check + device check + licence row | Each download |
| POST | `/api/v1/media/offline/:contentId/renew` | Signed in | 🔴 Heavy | Access check + device check + licence row | Each download |

## Customer: my account (`/me`) (45)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/me/profile` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| PATCH | `/api/v1/me/profile` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/my-list` | Signed in | 🟡 Medium | The user's rows joined with titles + signed images | Home and account pages |
| POST | `/api/v1/me/my-list/:contentId` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| DELETE | `/api/v1/me/my-list/:contentId` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/library` | Signed in | 🟡 Medium | The user's rows joined with titles + signed images | Home and account pages |
| POST | `/api/v1/me/library/:contentId` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| DELETE | `/api/v1/me/library/:contentId` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/continue` | Signed in | 🟡 Medium | The user's rows joined with titles + signed images | Home and account pages |
| GET | `/api/v1/me/progress/movie/:id` | Signed in | 🟢 Light | One row | Opening a player |
| PUT | `/api/v1/me/progress/movie/:id` | Signed in | 🟡 Medium | Upserts the progress row and the history entry | Every 30 s per viewer/reader/listener |
| GET | `/api/v1/me/progress/ebook/:id` | Signed in | 🟢 Light | One row | Opening a player |
| PUT | `/api/v1/me/progress/ebook/:id` | Signed in | 🟡 Medium | Upserts the progress row and the history entry | Every 30 s per viewer/reader/listener |
| GET | `/api/v1/me/progress/audiobook/:id` | Signed in | 🟢 Light | One row | Opening a player |
| PUT | `/api/v1/me/progress/audiobook/:id` | Signed in | 🟡 Medium | Upserts the progress row and the history entry | Every 30 s per viewer/reader/listener |
| GET | `/api/v1/me/history` | Signed in | 🟡 Medium | The user's rows joined with titles + signed images | Home and account pages |
| DELETE | `/api/v1/me/history/:contentId` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/ebooks/:ebookId/bookmarks` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| POST | `/api/v1/me/ebooks/:ebookId/bookmarks` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| DELETE | `/api/v1/me/ebooks/:ebookId/bookmarks/:bookmarkId` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/notifications` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| POST | `/api/v1/me/notifications/read-all` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| POST | `/api/v1/me/notifications/:id/read` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| DELETE | `/api/v1/me/notifications/:id` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/age-verification` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| POST | `/api/v1/me/age-verification` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| GET | `/api/v1/me/subscription/` | Signed in | 🟡 Medium | Subscription + plan | Most pages for signed-in users |
| POST | `/api/v1/me/subscription/checkout` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| POST | `/api/v1/me/subscription/payment-intent` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| POST | `/api/v1/me/subscription/sync` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| POST | `/api/v1/me/subscription/cancel` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| POST | `/api/v1/me/subscription/retry-payment` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| POST | `/api/v1/me/subscription/resume` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| POST | `/api/v1/me/subscription/change-plan` | Signed in | 🔴 Heavy | Calls Stripe (checkout, payment intent, cancel, resume, change plan, sync) | Rare |
| GET | `/api/v1/me/subscription/change-plan/preview` | Signed in | 🔴 Heavy | Reads the subscription; preview and credit ask Stripe (external, ~300-800 ms) | Account pages |
| GET | `/api/v1/me/subscription/credit` | Signed in | 🔴 Heavy | Reads the subscription; preview and credit ask Stripe (external, ~300-800 ms) | Account pages |
| POST | `/api/v1/me/payment-methods/setup` | Signed in | 🔴 Heavy | Calls Stripe | Rare |
| GET | `/api/v1/me/payment-methods/` | Signed in | 🔴 Heavy | Calls Stripe | Rare |
| POST | `/api/v1/me/payment-methods/:id/default` | Signed in | 🔴 Heavy | Calls Stripe | Rare |
| DELETE | `/api/v1/me/payment-methods/:id` | Signed in | 🔴 Heavy | Calls Stripe | Rare |
| GET | `/api/v1/me/payments/` | Signed in | 🔴 Heavy | Calls Stripe | Rare |
| POST | `/api/v1/me/billing-portal` | Signed in | 🔴 Heavy | Calls Stripe | Rare |
| POST | `/api/v1/me/devices/register` | Signed in | 🟡 Medium | Device limit check + upsert | Each sign-in on a device |
| GET | `/api/v1/me/devices/` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |
| DELETE | `/api/v1/me/devices/:id` | Signed in | 🟢 Light | One or two small reads/writes for the signed-in user | Occasional |

## Billing webhooks (1)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| POST | `/api/v1/webhooks/stripe` | Stripe signature | 🔴 Heavy | Verifies Stripe's signature, then updates subscription, payment and invoice rows in one transaction | Each Stripe event |

## Admin: content (movies, eBooks, audiobooks) (53)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/movies/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/movies/` | Admin | 🔴 Heavy | Creates the title with genres, cast, crew, languages, territories in one transaction | Each new title |
| GET | `/api/v1/admin/movies/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/movies/:id` | Admin | 🔴 Heavy | Updates the title and replaces its related rows in one transaction; clears the public cache | Each save |
| PATCH | `/api/v1/admin/movies/:id` | Admin | 🔴 Heavy | Updates the title and replaces its related rows in one transaction; clears the public cache | Each save |
| DELETE | `/api/v1/admin/movies/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/movies/:id/publish` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/movies/:id/unpublish` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/movies/:id/archive` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/movies/:id/schedule` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/movies/:id/cancel-schedule` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| GET | `/api/v1/admin/ebooks/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/ebooks/` | Admin | 🔴 Heavy | Creates the title with genres, cast, crew, languages, territories in one transaction | Each new title |
| GET | `/api/v1/admin/ebooks/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/ebooks/:id` | Admin | 🔴 Heavy | Updates the title and replaces its related rows in one transaction; clears the public cache | Each save |
| PATCH | `/api/v1/admin/ebooks/:id` | Admin | 🔴 Heavy | Updates the title and replaces its related rows in one transaction; clears the public cache | Each save |
| DELETE | `/api/v1/admin/ebooks/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/ebooks/:id/publish` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/ebooks/:id/unpublish` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/ebooks/:id/archive` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/ebooks/:id/schedule` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/ebooks/:id/cancel-schedule` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/ebooks/:id/editions` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/ebooks/:id/editions/:editionId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/ebooks/:id/editions/:editionId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/audiobooks/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/audiobooks/` | Admin | 🔴 Heavy | Creates the title with genres, cast, crew, languages, territories in one transaction | Each new title |
| GET | `/api/v1/admin/audiobooks/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/audiobooks/:id` | Admin | 🔴 Heavy | Updates the title and replaces its related rows in one transaction; clears the public cache | Each save |
| PATCH | `/api/v1/admin/audiobooks/:id` | Admin | 🔴 Heavy | Updates the title and replaces its related rows in one transaction; clears the public cache | Each save |
| DELETE | `/api/v1/admin/audiobooks/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/audiobooks/:id/publish` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/audiobooks/:id/unpublish` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/audiobooks/:id/archive` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/audiobooks/:id/schedule` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/audiobooks/:id/cancel-schedule` | Admin | 🟡 Medium | Status change + checks; clears the public cache | Occasional |
| POST | `/api/v1/admin/audiobooks/:id/editions` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/audiobooks/:id/editions/:editionId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/audiobooks/:id/editions/:editionId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/audiobooks/:id/chapters` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/audiobooks/:id/chapters/reorder` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/audiobooks/:id/chapters/:chapterId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/audiobooks/:id/chapters/:chapterId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/drafts/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/genres/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/genres/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/genres/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/genres/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/tags/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/tags/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/warning-types/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/languages/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/languages/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |

## Admin: homepage, collections, banners, legal, settings (34)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/collections/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/collections/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/collections/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/collections/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/collections/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/collections/:id/items` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/collections/:id/items/reorder` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/collections/:id/items/:contentId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/homepage/sections/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/homepage/sections/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/homepage/sections/reorder` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/homepage/sections/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/homepage/sections/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/homepage/sections/:id/items` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/homepage/sections/:id/items` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/homepage/sections/:id/items/reorder` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/homepage/sections/:id/items/:contentId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/banners/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/banners/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/banners/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/banners/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| DELETE | `/api/v1/admin/banners/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/legal/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/legal/:type` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/legal/:type/preview` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/legal/:type/versions` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/legal/:type/draft` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/legal/:type/draft` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/legal/:type/publish` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/settings/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/settings/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/settings/:key` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/settings` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PATCH | `/api/v1/admin/settings` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |

## Admin: uploads & media library (20)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| POST | `/api/v1/admin/uploads/multipart/initiate` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| POST | `/api/v1/admin/uploads/multipart/:uploadId/part` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| POST | `/api/v1/admin/uploads/multipart/:uploadId/complete` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| DELETE | `/api/v1/admin/uploads/multipart/:uploadId` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| POST | `/api/v1/admin/uploads/presign` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| POST | `/api/v1/admin/uploads/:assetId/complete` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| POST | `/api/v1/admin/uploads/:assetId/abort` | Admin | 🟡 Medium | Creates signed R2 upload links; the file itself goes straight to R2. Complete starts processing | Each upload |
| GET | `/api/v1/admin/uploads/:assetId/status` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/media/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/media/stats` | Admin | 🟡 Medium | Counts and sizes over all media | Media library |
| POST | `/api/v1/admin/media/reconcile` | Admin | 🔴 Heavy | Lists the whole R2 bucket and compares it with the library / deletes many files | Rare |
| POST | `/api/v1/admin/media/orphans/delete` | Admin | 🔴 Heavy | Lists the whole R2 bucket and compares it with the library / deletes many files | Rare |
| POST | `/api/v1/admin/media/bulk-delete` | Admin | 🔴 Heavy | Lists the whole R2 bucket and compares it with the library / deletes many files | Rare |
| GET | `/api/v1/admin/media/:assetId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PATCH | `/api/v1/admin/media/:assetId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/media/:assetId/replace` | Admin | 🔴 Heavy | Starts video/audio processing (ffmpeg: very CPU-heavy, runs in the worker) | Rare |
| DELETE | `/api/v1/admin/media/:assetId` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/media/:assetId/retry-processing` | Admin | 🔴 Heavy | Starts video/audio processing (ffmpeg: very CPU-heavy, runs in the worker) | Rare |
| GET | `/api/v1/admin/content/:contentId/media` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/content/:contentId/media/:assetId/attach` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |

## Admin: plans, subscriptions, payments (11)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/plans/` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/plans/` | Admin | 🔴 Heavy | Creates/updates the Stripe product and price | Rare |
| GET | `/api/v1/admin/plans/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| PUT | `/api/v1/admin/plans/:id` | Admin | 🔴 Heavy | Creates/updates the Stripe product and price | Rare |
| GET | `/api/v1/admin/subscriptions/` | Admin | 🟡 Medium | Filtered, paginated list with joins | Admin pages |
| GET | `/api/v1/admin/subscriptions/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/payments/` | Admin | 🟡 Medium | Filtered, paginated list with joins | Admin pages |
| GET | `/api/v1/admin/payments/summary` | Admin | 🔴 Heavy | Sums over all payments | Admin billing |
| GET | `/api/v1/admin/payments/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/payments/:id/refund` | Admin | 🔴 Heavy | Calls Stripe | Rare |
| POST | `/api/v1/admin/billing/reconcile/:userId` | Admin | 🔴 Heavy | Calls Stripe | Rare |

## Admin: users, notifications, audit (12)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/users/` | Admin | 🟡 Medium | Filtered, paginated list with joins | Admin pages |
| GET | `/api/v1/admin/users/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/users/:id/activity` | Admin | 🟡 Medium | History + sessions for one user | Admin user page |
| PATCH | `/api/v1/admin/users/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/users/:id/suspend` | Admin | 🟡 Medium | Status change + revokes sessions | Rare |
| POST | `/api/v1/admin/users/:id/unsuspend` | Admin | 🟡 Medium | Status change + revokes sessions | Rare |
| DELETE | `/api/v1/admin/users/:id` | Admin | 🟡 Medium | Status change + revokes sessions | Rare |
| POST | `/api/v1/admin/notifications/announce` | Admin | 🔴 Heavy | Creates a notification row for every customer (grows with user count) | Rare |
| GET | `/api/v1/admin/audit-logs/` | Admin | 🟡 Medium | Filtered, paginated list with joins | Admin pages |
| GET | `/api/v1/admin/audit-logs/:id` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| GET | `/api/v1/admin/announcements` | Admin | 🟢 Light | Simple read or write of one record or a short list | Admin only |
| POST | `/api/v1/admin/announcements` | Admin | 🔴 Heavy | Creates a notification row for every customer (grows with user count) | Rare |

## Admin: dashboard & analytics (14)

| Method | Path | Access | Level | What it does | How often |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/dashboard/` | Admin | 🔴 Heavy | Counts and sums across users, subscriptions, payments and content. Cached | Admin dashboard |
| GET | `/api/v1/admin/dashboard/summary` | Admin | 🔴 Heavy | Counts and sums across users, subscriptions, payments and content. Cached | Admin dashboard |
| GET | `/api/v1/admin/dashboard/recent-content` | Admin | 🔴 Heavy | Counts and sums across users, subscriptions, payments and content. Cached | Admin dashboard |
| GET | `/api/v1/admin/dashboard/recent-users` | Admin | 🔴 Heavy | Counts and sums across users, subscriptions, payments and content. Cached | Admin dashboard |
| GET | `/api/v1/admin/dashboard/platform-status` | Admin | 🔴 Heavy | Counts and sums across users, subscriptions, payments and content. Cached | Admin dashboard |
| GET | `/api/v1/admin/analytics/users` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/subscriptions` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/revenue` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/movies` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/ebooks` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/audiobooks` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/top-content` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/analytics/top-genres` | Admin | 🔴 Heavy | Grouped totals over days (users, revenue, plays, top titles). Cached | Admin analytics |
| GET | `/api/v1/admin/content/:contentId/stats` | Admin | 🟡 Medium | Totals for one title | Admin title page |

## Test results (local, 6 Nov 2026)

Run on a local copy (4-core PC, local MySQL, the real R2 bucket), with the load tool on the same PC, so the numbers compare APIs with each other rather than predict the live server exactly.

### 1. Every API called once

- **231 of 233 routes called** (2 skipped because they delete real files in the shared R2 bucket: orphan delete and bulk delete; media reconcile also skipped).
- **0 server errors (5xx), 0 timeouts.** 99 answered OK; the rest answered a correct "not found" (70), "invalid input" (54) or "not allowed" (4) — writes were sent to a made-up id on purpose so nothing real changed.
- **33 real flows** (add/remove My List and Library, save progress for all 3 types, bookmarks, notifications, press Play → heartbeat → end, open eBook, play audiobook, create/edit/delete genre and collection, search, wrong password refused, no token refused, customer blocked from admin, change password, sign out everywhere, delete user): **all work.**
- Note: every local movie is set to **Public** (free for everyone), so a user with no subscription can play it. That is correct for that setting; set titles to Subscribers only if they should be paid.

### 1b. The 54 "invalid input" APIs, re-tested with correct input

All 54 answered "invalid input" in step 1 only because they were sent an empty body. Re-tested with correct input on throwaway records (created for the test, then deleted): **all 54 work.**

- Sign-in: register, login, forgot password work; a made-up reset link is refused ("This reset link is invalid or has expired").
- Customer: progress save (movie, eBook, audiobook), bookmark, age verification, device register work. Checkout and payment-intent work (Stripe **test** keys are set up locally). Change plan and its preview correctly say "you need an active subscription" for a customer without one.
- Search (titles and people) and suggestions work. Offline download: authorize → download the file with its token works (748 KB segment); a bad token is refused (401).
- Admin: create movie / eBook / audiobook, schedule, eBook and audiobook editions, audiobook chapters and reorder, genres, tags, languages (a duplicate code is refused), collections + items + reorder, homepage sections + items + reorder, banners, legal (read, versions, preview, draft, publish), settings (single and batch), uploads (presign, multipart start → part link → abort), media replace (unknown file refused), plans, announcements.
- Left behind on the local database by this test (no delete API exists for them): one tag `apivalid-…`, one inactive plan "API Valid Plan …" (plus its Stripe **test** product), the refund policy republished as a new version with the same text, and two "API test announcement — please ignore" notifications.

### 2. Load: 50 users hitting each API nonstop for 5 s

req/s = requests per second it handled; p50 / p99 = typical / worst wait in ms.

| API | req/s | p50 ms | p99 ms | OK |
|---|---|---|---|---|
| `GET /media/hls/:id/master.m3u8 (video playlist)` | 40 | 918 | 2403 | 100% |
| `POST /auth/login (password hashing), 20 users` | 8 | 1616 | 2754 | 100% |
| `GET /api/v1/admin/media/` | 46 | 956 | 1326 | 100% |
| `GET /api/v1/me/continue` | 51 | 810 | 1251 | 100% |
| `POST /media/movies/:id/playback (press Play)` | 51 | 786 | 1702 | 100% |
| `GET /api/v1/search/suggestions?q=<16 different words>` | 54 | 814 | 1152 | 100% |
| `GET /api/v1/banners/` | 57 | 699 | 1477 | 100% |
| `GET /api/v1/admin/media/stats` | 59 | 708 | 1237 | 100% |
| `PUT /me/progress/movie/:id (saved every 30 s while watching)` | 60 | 602 | 1715 | 100% |
| `GET /api/v1/admin/media/:assetId` | 80 | 544 | 1144 | 100% |
| `GET /api/v1/admin/movies/` | 100 | 466 | 612 | 100% |
| `GET /api/v1/me/history` | 102 | 455 | 591 | 100% |
| `GET /api/v1/admin/ebooks/` | 105 | 440 | 761 | 100% |
| `GET /api/v1/admin/audiobooks/` | 107 | 407 | 881 | 100% |
| `GET /api/v1/collections/:slug` | 110 | 416 | 589 | 100% |
| `GET /metrics` | 148 | 309 | 720 | 100% |
| `POST /me/playback-sessions/:id/heartbeat (every 30 s while watching)` | 153 | 285 | 751 | 100% |
| `GET /api/v1/admin/homepage/sections/` | 159 | 298 | 410 | 100% |
| `GET /api/v1/audiobooks/:slug` | 170 | 277 | 513 | 100% |
| `GET /api/v1/admin/ebooks/:id` | 175 | 264 | 517 | 100% |
| `GET /api/v1/admin/audiobooks/:id` | 185 | 247 | 579 | 100% |
| `GET /api/v1/admin/payments/summary` | 195 | 218 | 732 | 100% |
| `GET /api/v1/admin/movies/:id` | 197 | 237 | 519 | 100% |
| `GET /api/v1/admin/drafts/` | 205 | 236 | 385 | 100% |
| `GET /api/v1/admin/users/` | 230 | 185 | 580 | 100% |
| `GET /api/v1/metrics` | 237 | 188 | 392 | 100% |
| `GET /api/v1/movies/:slug` | 250 | 193 | 230 | 100% |
| `GET /api/v1/ebooks/:slug` | 250 | 193 | 234 | 100% |
| `GET /api/v1/genres/` | 256 | 139 | 1265 | 100% |
| `GET /api/v1/me/my-list` | 265 | 181 | 353 | 100% |
| `GET /api/v1/admin/content/:contentId/media` | 279 | 165 | 558 | 100% |
| `GET /api/v1/me/library` | 280 | 158 | 458 | 100% |
| `GET /api/v1/admin/plans/:id` | 280 | 179 | 257 | 100% |
| `GET /api/v1/admin/legal/` | 286 | 167 | 278 | 100% |
| `GET /api/v1/admin/homepage/sections/:id/items` | 290 | 158 | 557 | 100% |
| `GET /api/v1/admin/plans/` | 295 | 165 | 289 | 100% |
| `GET /api/v1/admin/collections/:id` | 300 | 158 | 260 | 100% |
| `GET /api/v1/me/profile` | 307 | 152 | 394 | 100% |
| `GET /api/v1/me/payments/` | 307 | 148 | 268 | 100% |
| `GET /api/v1/admin/payments/` | 309 | 147 | 357 | 100% |
| `GET /api/v1/me/progress/movie/:id` | 310 | 128 | 721 | 100% |
| `GET /api/v1/admin/banners/` | 312 | 155 | 255 | 100% |
| `GET /api/v1/admin/audit-logs/` | 330 | 148 | 234 | 100% |
| `GET /api/v1/me/subscription/` | 335 | 141 | 222 | 100% |
| `GET /api/v1/auth/me` | 336 | 131 | 296 | 100% |
| `GET /api/v1/me/progress/audiobook/:id` | 346 | 122 | 421 | 100% |
| `GET /api/v1/me/progress/ebook/:id` | 355 | 136 | 274 | 100% |
| `GET /api/v1/me/notifications` | 360 | 131 | 177 | 100% |
| `GET /api/v1/admin/subscriptions/` | 361 | 136 | 169 | 100% |
| `GET /api/v1/admin/users/:id` | 361 | 133 | 256 | 0% |
| `GET /api/v1/admin/collections/` | 379 | 124 | 203 | 100% |
| `GET /api/v1/admin/uploads/:assetId/status` | 379 | 123 | 220 | 100% |
| `GET /api/v1/admin/announcements` | 379 | 118 | 214 | 100% |
| `GET /api/v1/me/devices/` | 386 | 117 | 311 | 100% |
| `GET /api/v1/admin/genres/` | 386 | 125 | 264 | 100% |
| `GET /api/v1/admin/subscriptions/:id` | 400 | 121 | 234 | 100% |
| `GET /api/v1/admin/dashboard/recent-users` | 400 | 116 | 220 | 100% |
| `GET /api/v1/me/age-verification` | 401 | 113 | 210 | 100% |
| `GET /api/v1/admin/tags/` | 404 | 125 | 212 | 100% |
| `GET /api/v1/admin/banners/:id` | 406 | 121 | 166 | 100% |
| `GET /api/v1/admin/dashboard/recent-content` | 406 | 112 | 213 | 100% |
| `GET /api/v1/me/ebooks/:ebookId/bookmarks` | 430 | 102 | 364 | 100% |
| `GET /api/v1/admin/users/:id/activity` | 436 | 111 | 164 | 0% |
| `GET /api/v1/me/payment-methods/` | 442 | 110 | 155 | 100% |
| `GET /api/v1/me/subscription/credit` | 444 | 110 | 152 | 100% |
| `GET /api/v1/admin/audit-logs/:id` | 462 | 104 | 216 | 100% |
| `GET /api/v1/admin/analytics/subscriptions` | 476 | 91 | 201 | 100% |
| `GET /api/v1/admin/languages/` | 486 | 100 | 161 | 100% |
| `GET /api/v1/admin/settings/` | 489 | 98 | 169 | 100% |
| `GET /api/v1/homepage/` | 492 | 83 | 590 | 100% |
| `GET /api/v1/admin/warning-types/` | 502 | 96 | 142 | 100% |
| `GET /api/v1/admin/settings` | 515 | 94 | 125 | 100% |
| `GET /api/v1/admin/analytics/top-content` | 526 | 89 | 151 | 100% |
| `GET /api/v1/admin/content/:contentId/stats` | 606 | 77 | 180 | 100% |
| `GET /api/v1/admin/dashboard/summary` | 611 | 77 | 125 | 100% |
| `GET /api/v1/admin/analytics/users` | 621 | 77 | 123 | 100% |
| `GET /api/v1/admin/dashboard/platform-status` | 634 | 74 | 197 | 100% |
| `GET /api/v1/admin/analytics/movies` | 634 | 75 | 138 | 100% |
| `GET /api/v1/admin/dashboard/` | 642 | 73 | 162 | 100% |
| `GET /api/v1/admin/analytics/ebooks` | 644 | 73 | 122 | 100% |
| `GET /api/v1/admin/analytics/revenue` | 646 | 74 | 116 | 100% |
| `GET /api/v1/admin/analytics/audiobooks` | 652 | 73 | 102 | 100% |
| `GET /api/v1/admin/analytics/top-genres` | 652 | 74 | 119 | 100% |
| `GET /api/v1/settings/public` | 704 | 60 | 252 | 100% |
| `GET /api/v1/search?q=<16 different words>` | 808 | 35 | 757 | 100% |
| `GET /ready` | 850 | 55 | 128 | 100% |
| `GET /api/v1/ready` | 1010 | 39 | 129 | 100% |
| `GET /api/v1/plans/` | 1116 | 34 | 231 | 100% |
| `GET /api/v1/audiobooks/` | 1609 | 23 | 128 | 100% |
| `GET /api/v1/ebooks/` | 1692 | 27 | 71 | 100% |
| `GET /api/v1/health` | 1722 | 25 | 87 | 100% |
| `GET /api/v1/movies/` | 1815 | 24 | 88 | 100% |
| `GET /api/v1/collections/` | 2190 | 20 | 76 | 100% |
| `GET /health` | 2564 | 15 | 73 | 100% |

(`/admin/users/:id` and `/activity` show 404 because the test user they pointed at was deleted by the test itself — not a fault.)

### 3. Slow spots found (now fixed: see Test results 5 below)

| # | Problem | Measured | Why |
|---|---|---|---|
| 1 | **Sign-ins freeze the whole server** | `/health` drops from 3,603 to **17 req/s** (waits up to 1.6 s) while 20 people sign in; login itself 8 req/s | Password hashing (argon2 in WebAssembly) runs on the server's only main thread, so nothing else is answered meanwhile |
| 2 | **Video playlist is slow** | ~1 s each, 40 req/s | Reads the playlist file from R2 on every request, although it never changes after processing |
| 3 | **Banners (public)** | 57 req/s, 700 ms | Not cached (every other public list is) |
| 4 | **Search suggestions** | 54 req/s, 800 ms | Not cached; text search on every keystroke pause |
| 5 | **Continue watching** | 51 req/s, 800 ms | 3 lists then 3 separate card lookups |
| 6 | **Press Play** | 51 req/s, 790 ms | Several checks one after another |
| 7 | **Progress save** (every 30 s per viewer) | 60 req/s, 600 ms | 4 database trips one after another; 3,000 viewers need ~100/s |
| 8 | **Collection page** | 110 req/s, 416 ms | Not cached |
| 9 | Admin media library (admin only) | 46 req/s, 956 ms | Large list with sizes; low priority |

### 4. Every screen (frontend routes)

- **196 screens opened** as a visitor, a customer and an admin, on desktop and phone: **0 crashes, 0 server errors, 0 stuck loaders, 0 pages wider than the phone.**
- Guards work: a visitor is sent to Sign in from My List, Library, History, Profile, Subscription, Notifications, Payment methods, Downloads, Watch/Read/Listen and Admin; a customer opening Admin sees "Admin access required" and no admin data is requested; a signed-in customer opening Sign in goes home.
- Old links redirect: `/privacy` → `/privacy-policy`, `/terms` → `/terms-and-conditions`, `/sign-up` and `/signup/*` → `/signup/plan` (step 1).
- Slowest first load: homepage 3-7.6 s (images from R2 + first visit), Watch page makes 15 API calls, Admin Banners 15.

## Test results 5: latency optimization (before → after, same load test)

Same machine, same local MySQL (pool of 10 connections), same script (`bench.mjs`), 5 s per run, run back-to-back. Numbers are from this PC, not production; compare them with each other, not with live traffic.

### Summary at 50 concurrent users

| API | Before (req/s, p50) | After (req/s, p50) | Improvement | SQL per request (before → after) | Cache used | Status |
|---|---|---|---|---|---|---|
| Homepage | 554, 82 ms | 531, 85 ms | 1.0× throughput | — | already cached (homepage:public) | OK |
| Movies list | 1622, 27 ms | 1802, 26 ms | 1.1× throughput | — | already cached | OK |
| eBooks list | 1878, 24 ms | 1798, 25 ms | 1.0× throughput | — | already cached | OK |
| Audiobooks list | 2089, 21 ms | 1929, 23 ms | 0.9× throughput | — | already cached | OK |
| Search (16 words) | 1699, 26 ms | 1909, 25 ms | 1.1× throughput | — | already cached | OK |
| Search suggestions (16 words) | 70, 687 ms | 2310, 20 ms | 33.0× throughput | 6 → 0 | NEW homepage:suggestions:{q} | OK |
| Banners | 76, 613 ms | 2159, 21 ms | 28.4× throughput | 2 → 0 | NEW homepage:banners:{type}:{placement} (+ start/end aware) | OK |
| Genres | 627, 75 ms | 1942, 23 ms | 3.1× throughput | 1 → 0 | NEW homepage:genres | OK |
| Legal page (refund policy) | 538, 83 ms | 2152, 21 ms | 4.0× throughput | 1 → 0 | NEW homepage:legal:{type} | OK |
| Collection detail | 103, 461 ms | 1874, 22 ms | 18.2× throughput | 5 → 0 | NEW homepage:collection:{slug} | OK |
| Movie detail (signed in) | 190, 253 ms | 183, 262 ms | 1.0× throughput | 5 → 4 | shared part already cached; access per user | OK |
| Play authorization | 63, 688 ms | 120, 386 ms | 1.9× throughput | 10 → 9 | none (per user, checked every time) | OK |
| Video playlist (master.m3u8) | 89, 462 ms | 263, 172 ms | 3.0× throughput | 2 → 2 | NEW media:playlist:{asset}:{version}:{file} (file text only) | OK |
| Progress update | 120, 401 ms | 157, 315 ms | 1.3× throughput | 13 → 5 | none (per user) | OK |
| Continue watching | 61, 750 ms | 260, 180 ms | 4.3× throughput | 8 → 4 | none for the list; public cards homepage:card:{id} | OK |
| Sign in | 10, 4361 ms | 24, 1029 ms | 2.4× throughput | 10 → 10 | none (worker threads) | OK |

### All levels (10 / 50 / 100 concurrent users)

| API | Users | Before | After |
|---|---|---|---|
| Homepage | 10 | 557 req/s · p50 16 · p97.5 40 · p99 50 ms · err 0% | 546 req/s · p50 17 · p97.5 30 · p99 40 ms · err 0% |
| Homepage | 50 | 554 req/s · p50 82 · p97.5 169 · p99 235 ms · err 0% | 531 req/s · p50 85 · p97.5 177 · p99 199 ms · err 0% |
| Homepage | 100 | 572 req/s · p50 163 · p97.5 259 · p99 557 ms · err 0% | 668 req/s · p50 143 · p97.5 259 · p99 317 ms · err 0% |
| Movies list | 10 | 1389 req/s · p50 5 · p97.5 15 · p99 18 ms · err 0% | 1346 req/s · p50 6 · p97.5 13 · p99 17 ms · err 0% |
| Movies list | 50 | 1622 req/s · p50 27 · p97.5 52 · p99 61 ms · err 0% | 1802 req/s · p50 26 · p97.5 33 · p99 59 ms · err 0% |
| Movies list | 100 | 1637 req/s · p50 57 · p97.5 88 · p99 148 ms · err 0% | 1667 req/s · p50 55 · p97.5 90 · p99 131 ms · err 0% |
| eBooks list | 10 | 1789 req/s · p50 4 · p97.5 12 · p99 15 ms · err 0% | 1955 req/s · p50 4 · p97.5 8 · p99 12 ms · err 0% |
| eBooks list | 50 | 1878 req/s · p50 24 · p97.5 44 · p99 49 ms · err 0% | 1798 req/s · p50 25 · p97.5 44 · p99 59 ms · err 0% |
| eBooks list | 100 | 1715 req/s · p50 52 · p97.5 105 · p99 142 ms · err 0% | 1734 req/s · p50 55 · p97.5 112 · p99 148 ms · err 0% |
| Audiobooks list | 10 | 2061 req/s · p50 3 · p97.5 11 · p99 13 ms · err 0% | 2009 req/s · p50 4 · p97.5 9 · p99 11 ms · err 0% |
| Audiobooks list | 50 | 2089 req/s · p50 21 · p97.5 44 · p99 51 ms · err 0% | 1929 req/s · p50 23 · p97.5 44 · p99 62 ms · err 0% |
| Audiobooks list | 100 | 1903 req/s · p50 44 · p97.5 131 · p99 193 ms · err 0% | 2159 req/s · p50 44 · p97.5 80 · p99 111 ms · err 0% |
| Search (16 words) | 10 | 1633 req/s · p50 4 · p97.5 15 · p99 20 ms · err 0% | 1465 req/s · p50 6 · p97.5 16 · p99 22 ms · err 0% |
| Search (16 words) | 50 | 1699 req/s · p50 26 · p97.5 57 · p99 65 ms · err 0% | 1909 req/s · p50 25 · p97.5 42 · p99 51 ms · err 0% |
| Search (16 words) | 100 | 1680 req/s · p50 56 · p97.5 100 · p99 153 ms · err 0% | 1522 req/s · p50 64 · p97.5 103 · p99 153 ms · err 0% |
| Search suggestions (16 words) | 10 | 69 req/s · p50 135 · p97.5 253 · p99 258 ms · err 0% | 1883 req/s · p50 4 · p97.5 11 · p99 18 ms · err 0% |
| Search suggestions (16 words) | 50 | 70 req/s · p50 687 · p97.5 808 · p99 839 ms · err 0% | 2310 req/s · p50 20 · p97.5 32 · p99 36 ms · err 0% |
| Search suggestions (16 words) | 100 | 59 req/s · p50 1427 · p97.5 2178 · p99 2221 ms · err 0% | 1929 req/s · p50 47 · p97.5 95 · p99 114 ms · err 0% |
| Banners | 10 | 50 req/s · p50 142 · p97.5 1390 · p99 1448 ms · err 0% | 2319 req/s · p50 3 · p97.5 7 · p99 9 ms · err 0% |
| Banners | 50 | 76 req/s · p50 613 · p97.5 826 · p99 875 ms · err 0% | 2159 req/s · p50 21 · p97.5 44 · p99 54 ms · err 0% |
| Banners | 100 | 66 req/s · p50 1472 · p97.5 1832 · p99 2055 ms · err 0% | 1772 req/s · p50 49 · p97.5 131 · p99 202 ms · err 0% |
| Genres | 10 | 405 req/s · p50 16 · p97.5 32 · p99 49 ms · err 0% | 1906 req/s · p50 4 · p97.5 8 · p99 10 ms · err 0% |
| Genres | 50 | 627 req/s · p50 75 · p97.5 140 · p99 149 ms · err 0% | 1942 req/s · p50 23 · p97.5 40 · p99 72 ms · err 0% |
| Genres | 100 | 409 req/s · p50 179 · p97.5 570 · p99 865 ms · err 0% | 2039 req/s · p50 47 · p97.5 72 · p99 115 ms · err 0% |
| Legal page (refund policy) | 10 | 450 req/s · p50 19 · p97.5 46 · p99 56 ms · err 0% | 2107 req/s · p50 3 · p97.5 11 · p99 17 ms · err 0% |
| Legal page (refund policy) | 50 | 538 req/s · p50 83 · p97.5 141 · p99 152 ms · err 0% | 2152 req/s · p50 21 · p97.5 42 · p99 59 ms · err 0% |
| Legal page (refund policy) | 100 | 519 req/s · p50 167 · p97.5 366 · p99 368 ms · err 0% | 2133 req/s · p50 42 · p97.5 84 · p99 101 ms · err 0% |
| Collection detail | 10 | 103 req/s · p50 88 · p97.5 196 · p99 245 ms · err 0% | 2199 req/s · p50 4 · p97.5 7 · p99 8 ms · err 0% |
| Collection detail | 50 | 103 req/s · p50 461 · p97.5 533 · p99 553 ms · err 0% | 1874 req/s · p50 22 · p97.5 46 · p99 103 ms · err 0% |
| Collection detail | 100 | 100 req/s · p50 888 · p97.5 1414 · p99 1427 ms · err 0% | 2146 req/s · p50 45 · p97.5 70 · p99 107 ms · err 0% |
| Movie detail (signed in) | 10 | 154 req/s · p50 52 · p97.5 77 · p99 828 ms · err 0% | 218 req/s · p50 43 · p97.5 67 · p99 83 ms · err 0% |
| Movie detail (signed in) | 50 | 190 req/s · p50 253 · p97.5 288 · p99 294 ms · err 0% | 183 req/s · p50 262 · p97.5 359 · p99 396 ms · err 0% |
| Movie detail (signed in) | 100 | 160 req/s · p50 567 · p97.5 703 · p99 704 ms · err 0% | 216 req/s · p50 422 · p97.5 768 · p99 788 ms · err 0% |
| Play authorization | 10 | 81 req/s · p50 110 · p97.5 258 · p99 371 ms · err 0% | 137 req/s · p50 67 · p97.5 89 · p99 280 ms · err 0% |
| Play authorization | 50 | 63 req/s · p50 688 · p97.5 1254 · p99 1533 ms · err 0% | 120 req/s · p50 386 · p97.5 509 · p99 583 ms · err 0% |
| Play authorization | 100 | 56 req/s · p50 1409 · p97.5 2574 · p99 2751 ms · err 0% | 104 req/s · p50 910 · p97.5 1336 · p99 1392 ms · err 0% |
| Video playlist (master.m3u8) | 10 | 20 req/s · p50 429 · p97.5 1035 · p99 1097 ms · err 0% | 261 req/s · p50 30 · p97.5 63 · p99 347 ms · err 0% |
| Video playlist (master.m3u8) | 50 | 89 req/s · p50 462 · p97.5 925 · p99 1013 ms · err 0% | 263 req/s · p50 172 · p97.5 322 · p99 324 ms · err 0% |
| Video playlist (master.m3u8) | 100 | 104 req/s · p50 835 · p97.5 1393 · p99 1424 ms · err 0% | 286 req/s · p50 314 · p97.5 573 · p99 640 ms · err 0% |
| Progress update | 10 | 113 req/s · p50 86 · p97.5 121 · p99 142 ms · err 0% | 185 req/s · p50 51 · p97.5 68 · p99 89 ms · err 0% |
| Progress update | 50 | 120 req/s · p50 401 · p97.5 517 · p99 577 ms · err 0% | 157 req/s · p50 315 · p97.5 382 · p99 391 ms · err 0% |
| Progress update | 100 | 104 req/s · p50 820 · p97.5 1315 · p99 1345 ms · err 0% | 183 req/s · p50 505 · p97.5 716 · p99 846 ms · err 0% |
| Continue watching | 10 | 58 req/s · p50 152 · p97.5 600 · p99 615 ms · err 0% | 230 req/s · p50 37 · p97.5 75 · p99 277 ms · err 0% |
| Continue watching | 50 | 61 req/s · p50 750 · p97.5 1066 · p99 1072 ms · err 0% | 260 req/s · p50 180 · p97.5 317 · p99 320 ms · err 0% |
| Continue watching | 100 | 59 req/s · p50 1494 · p97.5 1788 · p99 1975 ms · err 0% | 300 req/s · p50 320 · p97.5 501 · p99 501 ms · err 0% |
| Sign in | 10 | 8 req/s · p50 892 · p97.5 1774 · p99 1774 ms · err 0% | 20 req/s · p50 293 · p97.5 1187 · p99 1323 ms · err 0% |
| Sign in | 50 | 10 req/s · p50 4361 · p97.5 4454 · p99 4538 ms · err 0% | 24 req/s · p50 1029 · p97.5 3179 · p99 3183 ms · err 0% |
| Sign in | 100 | 0 req/s (none finished in 5 s) | 19 req/s · p50 2333 · p97.5 3864 · p99 4483 ms · err 0% |

### Sign-in freeze test (a normal public API while 20 people sign in at the same time, 8 s)

| Measured | Before | After |
|---|---|---|
| Genres API alone | 661 req/s, p50 13 ms, p99 29 ms | 1718 req/s, p50 4 ms, p99 20 ms |
| Genres API while 20 people sign in | 11 req/s, p50 866 ms, p99 1503 ms | 784 req/s, p50 10 ms, p99 40 ms |
| /health alone | 4006 req/s, p50 1 ms, p99 8 ms | 3588 req/s, p50 2 ms, p99 8 ms |
| /health while 20 people sign in | 27 req/s, p50 191 ms, p99 1525 ms | 1579 req/s, p50 4 ms, p99 29 ms |
| Sign-ins completed meanwhile | 10 req/s, p50 1639 ms, p99 2048 ms | 22 req/s, p50 840 ms, p99 2768 ms |

### What changed

- **Sign-in**: argon2id (same parameters, same `$argon2id$v=19$m=19456,t=2,p=1$` hashes) now runs in a pool of worker threads (`piscina`, up to 4 threads) instead of on Node's single main thread. Last-login time and the new session row are written together.
- **Video playlist**: only the playlist FILE text is cached (`media:playlist:{assetId}:{asset updatedAt}:{file}`, 1 h; re-processing changes the key). The token, the title's visibility/READY state and the plan's quality limit are checked on every request (the two reads now run together); segment links are signed fresh every time; responses stay `private, no-store`.
- **New public caches** (`homepage:*`, cleared by every successful admin write, as before): banners (also rebuilt the moment a banner ends or the next one starts), genres, legal pages (published version only), one collection page, search suggestions, and per-title public cards used by Continue Watching.
- **Redis**: public cache entries are shared through Redis when `REDIS_URL` is set (`CACHE_DRIVER=auto`); an admin change deletes them in Redis and tells every instance to drop its memory copy. No Redis → memory only, as before. Redis slow or down → falls back to memory + database.
- **Play**: the user row loaded by the auth check is reused; access decision, master asset and saved position are read together; the plan read for the stream limit starts alongside them. The stream-limit check + session insert stay inside the per-user lock.
- **Progress save**: 13 → 5 SQL statements. The title check and the existing-progress read run together; progress and history are each ONE parameterised `UPDATE` (Prisma's upsert on MySQL was BEGIN + SELECT + UPDATE + SELECT + COMMIT), written together; a first save or a race falls back to the original upsert.
- **Continue Watching**: reads only the user's progress rows (id + percentage), then the titles' public cards in one batch from the card cache; visibility checked per title per request. 8 → 4 SQL statements, same response.
- **Title pages**: the signed-in user's row is no longer read twice.
- **Admin media library**: the list selects only the columns the table shows.
- **No database index added**: `EXPLAIN ANALYZE` showed the progress lookups already use the `(userId, …)` unique indexes (~0.05 ms); the slow part was Prisma's nested JSON joins, which caching removes.

### Not tested / limits

- **Real Redis: NOT TESTED** on this PC (no Redis server or WSL here; downloading one was blocked). The Redis code paths are covered by unit tests with a fake Redis (shared copy reused by a second instance, admin change clears all instances, Redis down → still works).
- **Play under load** uses ONE user for every connection, so all requests queue on that user's playback-session lock (the stream-limit protection). Many different users would not share one lock; that case was NOT TESTED.
- **Sign in** stays the slowest call by design (argon2id is meant to cost CPU): ~20-26 sign-ins per second on this PC with 4 threads. More capacity = more CPU cores or more server instances.

## Next step

Architecture check (load balancing, number of server copies, database, Redis, rate limits for ~3,000 users).
