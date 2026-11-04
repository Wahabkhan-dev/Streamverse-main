/** Standardised API envelope returned by all backend endpoints. */
export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode?: number;
}

/* ───────────────────────────────── Auth ──────────────────────────────────── */

export interface ApiUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  status: string;
  emailVerified: boolean;
  preferences: {
    country: string | null;
    preferredLanguage: string | null;
    subtitleLanguage: string | null;
    audioLanguage: string | null;
    videoQuality: string | null;
    audiobookSpeed: number | null;
  };
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthTokenResponse {
  accessToken: string;
  user: ApiUser;
}

/* ───────────────────────────────── Plans ─────────────────────────────────── */

export interface ApiPlan {
  id: string;
  name: string;
  slug: string;
  stripePriceId?: string;
  /** Price in minor currency units (e.g. cents). */
  priceAmount: number;
  currency: string;
  billingInterval: "MONTHLY" | "YEARLY";
  features: string[];
  active: boolean;
  displayOrder: number;
  description?: string | null;
  /** what the plan unlocks and how far a customer can go with it; null = no limit */
  moviesEnabled?: boolean;
  ebooksEnabled?: boolean;
  audiobooksEnabled?: boolean;
  maxVideoQuality?: string | null;
  maxDevices?: number | null;
  maxConcurrentStreams?: number | null;
  /** admin list only: customers currently on this plan */
  subscriberCount?: number;
}

/* ─────────────────────────────── Subscription ───────────────────────────── */

export interface ApiSubscription {
  id: string;
  /** upper-case from the API ("ACTIVE", "INCOMPLETE", ...); null when the customer has never subscribed */
  status: string | null;
  planId: string;
  plan?: ApiPlan;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  pendingPlanChange?: {
    planId: string;
    plan?: ApiPlan;
    effectiveDate: string;
  } | null;
}

export interface ApiInvoice {
  id: string;
  date: string;
  /** minor units (cents) */
  amount: number;
  currency: string;
  /** as the API sends it: "SUCCEEDED", "FAILED", "REFUNDED", ... (older shapes: "paid" / "open") */
  status: string;
  /** the plan's name, or the plan itself as `{ id, name }` */
  plan?: string | { id: string; name: string } | null;
  invoiceReference?: string | null;
  downloadUrl?: string;
}

/* ─────────────────────────────── Payment Methods ───────────────────────── */

export interface ApiPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName?: string;
  country?: string;
  isDefault: boolean;
}

/* ─────────────────────────────── Catalog ────────────────────────────────── */

export interface ApiCast {
  name: string;
  role: string;
  image?: string;
}

export interface ApiPromo {
  featured?: boolean;
  trending?: boolean;
  popular?: boolean;
  newRelease?: boolean;
}

export interface ApiRestrictions {
  access?: "Public" | "Subscription" | "Purchase";
  warnings?: string[];
  ageRating?: string;
}

export interface ApiMovie {
  id: string;
  /** the admin added a trailer / teaser that is ready to play (customer detail only) */
  hasTrailer?: boolean;
  hasTeaser?: boolean;
  cid?: string;
  title: string;
  slug: string;
  /** list cards carry `summary`; detail responses carry `description` */
  description?: string;
  summary?: string | null;
  /** legacy/admin shape */
  year?: number;
  duration?: number;
  /** what the customer API actually sends */
  releaseDate?: string | null;
  runtimeMinutes?: number | null;
  ageRating?: string | null;
  genres: string[];
  cast?: ApiCast[];
  director?: string;
  producer?: string;
  image?: string | null;
  backdropImage?: string | null;
  rating?: string | number | null;
  views?: number;
  language?: string;
  subtitles?: string[];
  audio?: string[];
  promo?: ApiPromo;
  restrictions?: ApiRestrictions;
  /** customer responses omit this (everything is published); admin lists send the DB enum, e.g. "PUBLISHED" */
  status?: string;
  /** customer detail opened by an admin's Preview: the title is not live yet and this is its status (e.g. "DRAFT") */
  previewStatus?: string;
  /** customer detail only: "You May Also Like", same type, most similar first */
  related?: ApiMixedCard[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** One chapter on an audiobook's detail: a marker inside the single file (startTimeSeconds), or its own file. */
export interface ApiBookChapter {
  chapterNumber: number;
  title: string;
  durationSeconds: number | null;
  startTimeSeconds?: number | null;
}

export interface ApiBook {
  id: string;
  cid?: string;
  title: string;
  slug: string;
  description?: string;
  summary?: string | null;
  year?: number;
  releaseDate?: string | null;
  ageRating?: string | null;
  genres: string[];
  author?: string | null;
  image?: string | null;
  pages?: number;
  pageCount?: number | null;
  duration?: number;
  durationSeconds?: number | null;
  narrator?: string | null;
  language?: string;
  languages?: string[];
  /** a count on list cards; the chapter list on an audiobook's detail */
  chapters?: number | ApiBookChapter[];
  publisher?: string | null;
  promo?: ApiPromo;
  restrictions?: ApiRestrictions;
  /** customer responses omit this (everything is published); admin lists send the DB enum, e.g. "PUBLISHED" */
  status?: string;
  /** customer detail opened by an admin's Preview: the title is not live yet and this is its status (e.g. "DRAFT") */
  previewStatus?: string;
  /** customer detail only: "You May Also Like", same type, most similar first */
  related?: ApiMixedCard[];
  tags?: string[];
  type?: "ebook" | "audiobook";
  /** the book also offers a page-turn (flipbook) version */
  flipbook?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * What GET /me/my-list, /me/library, /me/history and /me/continue (and collections, search, related titles) return:
 * type-agnostic content cards. `id` is the content id; `image` is the canonical signed cover/poster.
 */
export interface ApiMixedCard {
  id: string;
  slug: string;
  title: string;
  type: "MOVIE" | "EBOOK" | "AUDIOBOOK";
  summary?: string | null;
  description?: string | null;
  ageRating?: string | null;
  releaseDate?: string | null;
  genres: string[];
  image?: string | null;
  /** movie: "109 min"; eBook: author; audiobook: narrator/author */
  headline?: string | null;
  rating?: number | null;
  reviewCount?: number;
  /** My List / Library: when it was saved */
  addedAt?: string;
  /** History */
  lastAccessedAt?: string;
  activityType?: string;
}

/* ─────────────────────────────── Progress ───────────────────────────────── */

export interface ApiProgress {
  id: string;
  contentId: string;
  contentType: "movie" | "ebook" | "audiobook";
  percentage: number;
  positionSeconds?: number;
  positionPage?: number;
  chapterIndex?: number;
  chapterSeconds?: number;
  completed: boolean;
  updatedAt: string;
}

/* ─────────────────────────────── History ────────────────────────────────── */

export interface ApiHistoryEntry {
  id: string;
  contentId: string;
  contentType: "movie" | "ebook" | "audiobook";
  watchedAt: string;
  movie?: ApiMovie;
  ebook?: ApiBook;
  audiobook?: ApiBook;
}

/* ─────────────────────────────── Bookmarks ─────────────────────────────── */

export interface ApiBookmark {
  id: string;
  ebookId: string;
  /** where in the book: an EPUB position (CFI) or, for a PDF, the page number as text */
  location: string;
  page: number | null;
  label: string | null;
  createdAt: string;
}

/* ─────────────────────────────── Notifications ─────────────────────────── */

export type NotificationKind = "New Release" | "Subscription" | "Recommendation" | "Account";

export interface ApiNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle: string;
  read: boolean;
  createdAt: string;
}

/* ─────────────────────────────── Collections ────────────────────────────── */

export interface ApiCollectionItem {
  contentId: string;
  contentType: "movie" | "ebook" | "audiobook";
  position: number;
  movie?: ApiMovie;
  ebook?: ApiBook;
  audiobook?: ApiBook;
}

export interface ApiCollection {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover?: string;
  status: "Published" | "Draft";
  items: ApiCollectionItem[];
  createdAt?: string;
  updatedAt?: string;
}

/* ─────────────────────────────── Homepage / Banners ─────────────────────── */

export interface ApiBanner {
  id: string;
  type: string;
  title: string;
  description: string;
  buttonText: string;
  linkKind: "none" | "movie" | "ebook" | "audiobook" | "collection" | "subscription";
  linkId?: string;
  linkSlug?: string;
  image: string;
  mobileImage: string;
  priority: number;
  start: string;
  end: string;
  active: boolean;
  movie?: ApiMovie;
  ebook?: ApiBook;
  audiobook?: ApiBook;
  collection?: ApiCollection;
}

export interface ApiHomeSectionItem {
  contentId: string;
  contentType: "movie" | "ebook" | "audiobook";
  position: number;
  /** Card-safe fields the backend resolves for every item, manual or dynamic — same shape regardless of type. */
  slug: string;
  title: string;
  image: string | null;
  movie?: Pick<ApiMovie, "id" | "slug"> & Partial<ApiMovie>;
  ebook?: Pick<ApiBook, "id" | "slug" | "type"> & Partial<ApiBook>;
  audiobook?: Pick<ApiBook, "id" | "slug" | "type"> & Partial<ApiBook>;
}

/** What the customer homepage renders a section as. The server decides; the page never guesses from a section's key. */
export type HomeSectionKind = "hero" | "continue" | "collections" | "banner" | "collection" | "content";

export interface ApiHomeBanner {
  id: string;
  type: "HERO" | "NORMAL" | "LATEST_RELEASE" | "PROMOTIONAL";
  title: string;
  description?: string | null;
  buttonText?: string | null;
  image?: string | null;
  mobileImage?: string | null;
  linkToSubscription?: boolean;
  linkedContent?: { id: string; type: string; slug: string; title: string } | null;
}

export interface ApiHomeSection {
  id: string;
  key: string;
  displayTitle: string;
  type: "MANUAL" | "TRENDING" | "POPULAR" | "NEW_RELEASE" | "FEATURED" | "LATEST" | "HERO" | "BANNER" | "COLLECTION";
  kind?: HomeSectionKind;
  /** BANNER sections: the banner picked from the Banner library (already inside its schedule window). */
  banner?: ApiHomeBanner | null;
  /** COLLECTION sections: the collection shown, and (for kind "collections") every published collection. */
  collection?: { id: string; slug: string; name: string; image?: string | null } | null;
  collections?: Array<{ id: string; slug: string; name: string; image?: string | null }>;
  /** Which catalog a dynamic (non-MANUAL) section resolves against. Null/absent for MANUAL. */
  contentType?: "MOVIE" | "EBOOK" | "AUDIOBOOK" | null;
  enabled: boolean;
  displayOrder: number;
  itemLimit: number;
  items?: ApiHomeSectionItem[];
  updatedAt?: string;
}

/* ─────────────────────────────── Genres / Tags ─────────────────────────── */

export type ApiContentKind = "MOVIE" | "EBOOK" | "AUDIOBOOK";

export interface ApiGenre {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** which kind of title the genre applies to; null = all kinds */
  contentType: ApiContentKind | null;
  active: boolean;
  /** admin list only: how many titles use it */
  usage?: number;
}

export interface ApiGenreInput {
  name: string;
  description?: string;
  contentType?: ApiContentKind;
  active?: boolean;
}

export interface ApiTag {
  id: string;
  name: string;
  slug: string;
}

export interface ApiLanguage {
  id: string;
  name: string;
  code: string;
}

/* ─────────────────────────────── Legal ──────────────────────────────────── */

export interface ApiLegalPage {
  id: string;
  type: "privacy" | "terms" | "refund";
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  updatedAt: string;
}

/* ─────────────────────────────── Search ─────────────────────────────────── */

export interface ApiSearchResult {
  movies: ApiMovie[];
  ebooks: ApiBook[];
  audiobooks: ApiBook[];
  total: number;
}

export interface ApiSearchSuggestion {
  query: string;
  type: "movie" | "ebook" | "audiobook" | "general";
}

/* ─────────────────────────────── Media Access ───────────────────────────── */

/** Movies: playback is a backend-served HLS master playlist (variant playlists + segments are signed per object). */
export type ApiMoviePlaybackAccess =
  | { mediaReady: true; playback: { type: "HLS"; url: string; expiresAt: string }; sessionId?: string; progress?: { positionSeconds: number } | null }
  | { mediaReady: false; playback: null; sessionId?: string; progress?: null };

/** Audiobooks: a single signed file, or one signed file per chapter. */
export type ApiPlaybackAccess =
  | {
      mediaReady: true;
      playback: { mode: "SINGLE_FILE"; url: string; expiresAt: string };
      sessionId?: string;
      progress?: { positionSeconds: number; chapterId: string | null } | null;
    }
  | {
      mediaReady: true;
      playback: {
        mode: "CHAPTER_FILES";
        chapters: Array<{ chapterId: string; chapterNumber: number; title: string | null; url: string; expiresAt: string }>;
      };
      sessionId?: string;
      progress?: { positionSeconds: number; chapterId: string | null } | null;
    }
  | { mediaReady: false; playback: null; sessionId?: string; progress?: null };

export interface ApiEbookAccess {
  signedUrl: string | null;
  fileType: "epub" | "pdf" | null;
  contentId: string;
  expiresAt: string | null;
  progress: { location: string | null; page: number | null; pct: number } | null;
  mediaReady: boolean;
}

/** POST /media/offline/:id/authorize: the files that make up an offline copy, or why there is none. */
export interface ApiOfflineFile {
  id: string;
  name: string;
  role: "playlist" | "segment" | "video" | "ebook" | "audio" | "chapter" | "poster";
  mime: string;
  bytes: number | null;
  chapterNumber?: number;
  chapterTitle?: string;
}
export interface ApiOfflineAuthorization {
  access: { allowed: boolean; canConsume: boolean; reason?: string };
  mediaReady: boolean;
  download: {
    contentId: string;
    type: "MOVIE" | "EBOOK" | "AUDIOBOOK";
    title: string;
    expiresAt: string;
    token: string;
    playlist: { name: string; text: string } | null;
    files: ApiOfflineFile[];
  } | null;
}

/* ─────────────────────────────── Admin ──────────────────────────────────── */

export interface ApiAdminUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  subscriptionStatus?: string;
  country?: string;
  createdAt: string;
  lastLoginAt?: string;
  active: boolean;
}

export interface ApiAdminPayment {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed" | "refunded";
  plan?: string;
  createdAt: string;
  stripePaymentIntentId?: string;
}

export interface ApiAdminAnalytics {
  totalRevenue: number;
  activeSubscriptions: number;
  newSignups: number;
  churnRate: number;
  series: Array<{ date: string; revenue: number; subscriptions: number; signups: number }>;
}

/** GET /admin/dashboard/summary: real counts straight from the database */
export interface ApiDashboardSummary {
  totalMovies: number;
  totalEbooks: number;
  totalAudiobooks: number;
  publishedContent: number;
  draftContent: number;
  scheduledContent: number;
  archivedContent: number;
  processingContent: number;
  totalUsers: number;
  newUsersThisMonth: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  /** cents, refunds already taken off */
  totalRevenueCents: number;
  revenueThisMonth: number;
}

/** GET /admin/dashboard/platform-status */
export interface ApiPlatformStatus {
  database: "ok" | "error";
  mediaAssets: { processing: number; failed: number; ready: number };
  subscriptions: { active: number; pastDue: number };
  payments: { failedLast24h: number };
}

/** GET /admin/analytics/users */
export interface ApiUserGrowth {
  timeSeries: Array<{ date: string; newUsers: number; cumulativeUsers: number }>;
  activeUsers: number;
  totalNewUsers: number;
}

/** GET /admin/analytics/revenue */
export interface ApiRevenueSeries {
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  successfulPayments: number;
  failedPayments: number;
  timeSeries: Array<{ date: string; grossCents: number; refundedCents: number }>;
}

export interface ApiAdminSettings {
  maintenance: boolean;
  registration: boolean;
  autoPublish: boolean;
  ageGate: boolean;
  notifyNew: boolean;
  notifyBilling: boolean;
  autoplayNext: boolean;
  autoplayPreview: boolean;
  defaultLanguage: string;
}

export interface ApiPresignedUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  fields?: Record<string, string>;
}

export interface ApiSetupIntent {
  clientSecret: string;
}

/** What POST /me/subscription/sync returns: the customer's subscription as the server now sees it (status is the server's uppercase value). */
export interface ApiSyncedSubscription {
  status: string | null;
  plan: { name: string; price: number; billingInterval: string } | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

/** GET /me/subscription/change-plan/preview: what a plan change will do to the bill (an estimate; Stripe's invoice has the final figures). Amounts are in cents. */
export interface ApiPlanChangePreview {
  direction: "upgrade" | "downgrade";
  estimate: true;
  currency: string;
  fromPlan: { id: string; name: string; priceAmount: number; currency: string; billingInterval: string };
  toPlan: { id: string; name: string; priceAmount: number; currency: string; billingInterval: string };
  periodEnd: string | null;
  daysLeft: number;
  creditForUnused: number;
  newPlanForRest: number;
  chargeToday: number;
  creditAdded: number;
  nextRenewal: { date: string; amount: number } | null;
  paymentMethod: { brand: string; last4: string } | null;
}

/** GET /me/subscription/credit: credit that will be used up by the next invoice. Cents. */
export interface ApiAccountCredit {
  amount: number;
/** GET /admin/users/:id/activity: one customer's real subscription, billing, library and history. */
export interface ApiAdminUserActivity {
  subscription: {
    status: string;
    plan: { id: string; name: string; priceAmount: number; currency: string; billingInterval: string } | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  payments: { id: string; date: string; amount: number; currency: string; status: string; plan: { id: string; name: string } | null; invoiceReference: string | null; refunded: boolean }[];
  library: { id: string; title: string; type: string; at: string }[];
  history: { id: string; title: string; type: string; activityType: string; at: string }[];
}

  currency: string;
}

export interface ApiCheckoutSession {
  checkoutUrl: string;
  sessionId: string;
  url: string;
}
}

export interface ApiBillingPortal {
