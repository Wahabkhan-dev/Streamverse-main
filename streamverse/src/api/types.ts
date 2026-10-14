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
  name: string;
  role: "user" | "admin";
  avatar?: string;
  country?: string;
  language?: string;
  age?: number;
  verified?: boolean;
  subscriptionStatus?: string;
  createdAt?: string;
  updatedAt?: string;
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
}

/* ─────────────────────────────── Subscription ───────────────────────────── */

export interface ApiSubscription {
  id: string;
  status: "active" | "canceled" | "past_due" | "expired" | "trialing";
  planId: string;
  plan?: ApiPlan;
  currentPeriodStart: string;
  currentPeriodEnd: string;
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
  amount: number;
  currency: string;
  status: "paid" | "open" | "uncollectible" | "void";
  plan?: string;
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
  cid?: string;
  title: string;
  slug: string;
  description: string;
  year: number;
  duration: number;
  genres: string[];
  cast: ApiCast[];
  director?: string;
  producer?: string;
  image: string;
  backdropImage?: string;
  rating?: string;
  views?: number;
  language?: string;
  subtitles?: string[];
  audio?: string[];
  promo?: ApiPromo;
  restrictions?: ApiRestrictions;
  status?: "Published" | "Draft";
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiBook {
  id: string;
  cid?: string;
  title: string;
  slug: string;
  description: string;
  year?: number;
  genres: string[];
  author: string;
  image: string;
  pages?: number;
  duration?: number;
  narrator?: string;
  language?: string;
  languages?: string[];
  chapters?: number;
  publisher?: string;
  promo?: ApiPromo;
  restrictions?: ApiRestrictions;
  status?: "Published" | "Draft";
  tags?: string[];
  type: "ebook" | "audiobook";
  createdAt?: string;
  updatedAt?: string;
}

/* ─────────────────────────────── My-list / Library ─────────────────────── */

export interface ApiListItem {
  id: string;
  contentId: string;
  contentType: "movie" | "ebook" | "audiobook";
  addedAt: string;
  movie?: ApiMovie;
  ebook?: ApiBook;
  audiobook?: ApiBook;
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
  page: number;
  note?: string;
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
  movie?: ApiMovie;
  ebook?: ApiBook;
  audiobook?: ApiBook;
}

export interface ApiHomeSection {
  id: string;
  title: string;
  enabled: boolean;
  limit: number;
  mode: "auto" | "manual";
  autoFlag?: "featured" | "trending" | "popular" | "newRelease";
  items: ApiHomeSectionItem[];
}

/* ─────────────────────────────── Genres / Tags ─────────────────────────── */

export interface ApiGenre {
  id: string;
  name: string;
  type: string;
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

export interface ApiPlaybackAccess {
  url: string;
  token?: string;
  expiresAt?: string;
  captions?: Array<{ language: string; url: string }>;
  qualities?: Array<{ label: string; url: string }>;
}

export interface ApiEbookAccess {
  url: string;
  token?: string;
  expiresAt?: string;
  format?: string;
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

export interface ApiCheckoutSession {
  url: string;
}

export interface ApiBillingPortal {
  url: string;
}
