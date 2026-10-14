import { randomUUID } from "node:crypto";

/**
 * An in-memory stand-in for the Prisma Client, implementing only the calls this codebase's repositories
 * actually make (find/create/update/upsert/count/createMany/deleteMany, plus a non-transactional
 * `$transaction`).
 *
 * Why this exists: this sandbox has no reachable PostgreSQL (no Docker daemon, and embedded-postgres
 * crashes under it), so tests run the real service → repository chain against this fake instead of
 * mocking each repository individually — everything above the database line is exercised for real. It is
 * not a Prisma reimplementation; it supports exactly the where/data shapes this codebase's repositories
 * use. Known gap: `$transaction` here does not actually roll back on failure (it just runs the callback
 * against the same tables) — real atomicity is Postgres's job and isn't exercised by these tests.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

class UniqueConstraintError extends Error {
  code = "P2002";
  meta: { target: string[] };
  constructor(fields: string[]) {
    super(`Unique constraint failed on the fields: (${fields.join(", ")})`);
    this.meta = { target: fields };
  }
}

/**
 * `relations` is the CURRENT row's table's relation map (e.g. Movie's, when matching a Movie row) — it's
 * how `{ content: { status: "PUBLISHED" } }` knows "content" is a relation to resolve (via Movie's
 * `content` relation def) rather than a literal column. Falls back to the generic compound-unique-key
 * unwrap (`{ userId_movieId: { userId, movieId } }`) for any plain-object key that ISN'T a declared
 * relation on this table.
 */
function matches(row: Row, where: Where, relations: Record<string, RelationDef> = {}): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR" && Array.isArray(cond)) {
      if (!cond.some((c) => matches(row, c as Where, relations))) return false;
      continue;
    }
    if (key === "AND" && Array.isArray(cond)) {
      if (!cond.every((c) => matches(row, c as Where, relations))) return false;
      continue;
    }

    const rel = relations[key];
    if (rel && cond && typeof cond === "object" && !(cond instanceof Date)) {
      const localValue = row[rel.localField ?? "id"];
      if (rel.kind === "one") {
        const related = rel.table.rawRows().find((r) => r[rel.remoteField ?? "id"] === localValue);
        if (!related || !matches(related, cond as Where, rel.table.relations)) return false;
      } else {
        const some = (cond as { some?: Where }).some;
        const relatedRows = rel.table.rawRows().filter((r) => r[rel.remoteField] === localValue);
        if (some ? !relatedRows.some((r) => matches(r, some, rel.table.relations)) : relatedRows.length === 0) return false;
      }
      continue;
    }

    const actual = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { lt?: unknown; lte?: unknown; gt?: unknown; gte?: unknown; not?: unknown; contains?: string; mode?: string; in?: unknown[] };
      const isOperator = ["lt", "lte", "gt", "gte", "not", "contains", "in"].some((op) => op in c);
      // Prisma's compound-unique lookup, e.g. `{ userId_movieId: { userId, movieId } }` — "userId_movieId"
      // is never a real column; unwrap it into direct equality checks on its own fields instead.
      if (!isOperator) {
        if (!matches(row, cond as Where, relations)) return false;
        continue;
      }
      // Evaluate ALL operators present in a single condition object (e.g. { gte: ..., lte: ... })
      // before deciding pass/fail. Each operator that fires can short-circuit with return false.
      if ("lt" in c && c.lt !== undefined && c.lt !== null) {
        const ltVal = c.lt instanceof Date ? c.lt : new Date(c.lt as string);
        if (!(actual instanceof Date) || !(actual < ltVal)) return false;
      }
      if ("lte" in c && c.lte !== undefined && c.lte !== null) {
        const lteVal = c.lte instanceof Date ? c.lte : new Date(c.lte as string);
        if (!(actual instanceof Date) || !(actual <= lteVal)) return false;
      }
      if ("gt" in c && c.gt !== undefined && c.gt !== null) {
        const gtVal = c.gt instanceof Date ? c.gt : new Date(c.gt as string);
        if (!(actual instanceof Date) || !(actual > gtVal)) return false;
      }
      if ("gte" in c && c.gte !== undefined && c.gte !== null) {
        const gteVal = c.gte instanceof Date ? c.gte : new Date(c.gte as string);
        if (!(actual instanceof Date) || !(actual >= gteVal)) return false;
      }
      if ("not" in c) {
        if (actual === c.not) return false;
      }
      if ("contains" in c) {
        const hay = String(actual ?? "");
        const needle = c.contains ?? "";
        const ok = c.mode === "insensitive" ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle);
        if (!ok) return false;
      }
      if ("in" in c) {
        if (!c.in?.includes(actual)) return false;
      }
      continue; // all checks passed for this key
    }
    if (cond === null) {
      if (actual !== null && actual !== undefined) return false;
      continue;
    }
    if (actual !== cond) return false;
  }
  return true;
}

interface TableOptions<T extends Row> {
  /** mirrors this table's Prisma schema @default(...) values for columns a repository doesn't set itself */
  defaults?: Partial<T>;
  /** each entry is one @unique / @@unique constraint (one field, or several for a composite key) */
  uniqueSets?: string[][];
  /** composite-PK tables (no `id` column) key themselves by this instead of a generated id */
  keyOf?: (data: Partial<T>) => string;
}

/**
 * What `include: { someRelationName: true | {...} }` means for one field, resolved against another
 * Table. "one": someRelationName is this row's FK (`localField`) pointing at the other table's `id` (or
 * `remoteField`). "many": the other table has rows whose `remoteField` points back at this row's
 * `localField` (default `id`) — like a real Prisma relation, just declared explicitly instead of inferred
 * from the schema.
 */
type RelationDef = { table: Table<Row>; localField?: string } & ({ kind: "one"; remoteField?: string } | { kind: "many"; remoteField: string; orderBy?: [string, "asc" | "desc"] });
type IncludeSpec = Record<string, boolean | { include?: Record<string, IncludeSpec[string]>; orderBy?: Record<string, "asc" | "desc"> }>;

// Deliberately loose (not `keyof T`): this is a test fixture, and every table below is built from a
// `Partial<SomeRowShape>` that only covers the fields each repository actually sets explicitly — real
// column names (e.g. a unique constraint field) are often supplied only by a caller later.
class Table<T extends Row = Row> {
  private rows = new Map<string, T>();
  private readonly defaults: Partial<T>;
  private readonly uniqueSets: string[][];
  private readonly keyOf: ((data: Partial<T>) => string) | undefined;
  private readonly hasId: boolean;
  /** Not `private`: read cross-table by `matches()`/`withInclude()` when resolving another table's relation def. */
  relations: Record<string, RelationDef> = {};

  constructor(options: TableOptions<T> = {}) {
    this.defaults = options.defaults ?? {};
    this.uniqueSets = options.uniqueSets ?? [];
    this.keyOf = options.keyOf;
    this.hasId = !options.keyOf;
  }

  /** Declared once, after every table exists (relations point at sibling tables — see createFakePrisma). */
  setRelations(defs: Record<string, RelationDef>) {
    this.relations = defs;
  }

  clear() {
    this.rows.clear();
  }

  /** Resolves one `include` object against an already-fetched row. Used both externally and recursively. */
  private withInclude(row: T, include?: IncludeSpec): T {
    if (!include) return row;
    const out: Row = { ...row };
    for (const [key, spec] of Object.entries(include)) {
      const rel = this.relations[key];
      if (!rel || spec === false) continue;
      const nested = typeof spec === "object" ? spec.include : undefined;
      const localValue = row[rel.localField ?? "id"];
      if (rel.kind === "one") {
        const match = rel.table.rawRows().find((r) => r[rel.remoteField ?? "id"] === localValue);
        out[key] = match ? rel.table.withInclude(match, nested) : null;
      } else {
        let list = rel.table.rawRows().filter((r) => r[rel.remoteField] === localValue);
        const orderBy = (typeof spec === "object" ? spec.orderBy : undefined) ?? (rel.orderBy ? { [rel.orderBy[0]]: rel.orderBy[1] } : undefined);
        const orderEntry = orderBy ? Object.entries(orderBy)[0] : undefined;
        if (orderEntry) {
          const [field, dir] = orderEntry;
          list = [...list].sort((a, b) => ((a[field] as number) > (b[field] as number) ? 1 : -1) * (dir === "desc" ? -1 : 1));
        }
        out[key] = list.map((r) => rel.table.withInclude(r, nested));
      }
    }
    return out as T;
  }

  /** Internal, uncloned rows — only for cross-table relation lookups inside this file. Not `private`: `matches()`/`withInclude()` call it on a sibling table. */
  rawRows(): T[] {
    return [...this.rows.values()];
  }

  private assertUnique(row: T, excludeKey?: string) {
    for (const fields of this.uniqueSets) {
      const values = fields.map((f) => row[f]);
      if (values.some((v) => v === null || v === undefined)) continue; // SQL: NULL never collides with NULL
      const collision = [...this.rows.entries()].find(([k, r]) => k !== excludeKey && fields.every((f, i) => r[f] === values[i]));
      if (collision) throw new UniqueConstraintError(fields);
    }
  }

  async create({ data, include }: { data: Partial<T>; include?: IncludeSpec }): Promise<T> {
    // Prisma ignores undefined-valued fields entirely (falls back to the column default) — match that.
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;
    const now = new Date();
    const row = { ...this.defaults, ...clean, ...(this.hasId ? { id: clean["id"] ?? randomUUID() } : {}), createdAt: clean["createdAt"] ?? now, updatedAt: now } as unknown as T;
    const key = this.keyOf ? this.keyOf(clean) : (row["id"] as string);
    if (this.rows.has(key)) throw new UniqueConstraintError(["id"]); // primary-key collision (e.g. a 1-1 FK reused, or a composite-key join row repeated)
    this.assertUnique(row);
    this.rows.set(key, row);
    return structuredClone(this.withInclude(row, include));
  }

  async createMany({ data }: { data: Partial<T>[] }): Promise<{ count: number }> {
    for (const d of data) await this.create({ data: d });
    return { count: data.length };
  }

  async findUnique({ where, include }: { where: Where; include?: IncludeSpec }): Promise<T | null> {
    for (const row of this.rows.values()) if (matches(row, where, this.relations)) return structuredClone(this.withInclude(row, include));
    return null;
  }

  async findFirst({ where, include }: { where: Where; include?: IncludeSpec }): Promise<T | null> {
    return this.findUnique({ where, include });
  }

  async findMany({ where, orderBy, include, skip, take }: { where?: Where; orderBy?: Record<string, "asc" | "desc">; include?: IncludeSpec; skip?: number; take?: number } = {}): Promise<T[]> {
    let out = [...this.rows.values()].filter((r) => !where || matches(r, where, this.relations));
    const entry = orderBy ? Object.entries(orderBy)[0] : undefined;
    if (entry) {
      const [field, dir] = entry;
      out = [...out].sort((a, b) => {
        const av = a[field] as string | number;
        const bv = b[field] as string | number;
        return (av > bv ? 1 : av < bv ? -1 : 0) * (dir === "desc" ? -1 : 1);
      });
    }
    if (skip !== undefined) out = out.slice(skip);
    if (take !== undefined) out = out.slice(0, take);
    return out.map((r) => structuredClone(this.withInclude(r, include)));
  }

  async count({ where }: { where?: Where } = {}): Promise<number> {
    return (await this.findMany({ where })).length;
  }

  /** Just enough of Prisma's `aggregate` for `_sum` over one numeric field — this fake has no other callers of it. */
  async aggregate({ where, _sum }: { where?: Where; _sum?: Record<string, boolean> }): Promise<{ _sum: Record<string, number | null> }> {
    const rows = await this.findMany({ where });
    const sums: Record<string, number | null> = {};
    for (const field of Object.keys(_sum ?? {})) {
      sums[field] = rows.length ? rows.reduce((total, r) => total + ((r[field] as number) ?? 0), 0) : null;
    }
    return { _sum: sums };
  }

  private keyFor(where: Where): string | undefined {
    const match = [...this.rows.entries()].find(([, r]) => matches(r, where, this.relations));
    return match?.[0];
  }

  async update({ where, data, include }: { where: Where; data: Partial<T>; include?: IncludeSpec }): Promise<T> {
    const key = this.keyFor(where);
    if (!key) throw Object.assign(new Error("Record not found"), { code: "P2025" });
    const existing = this.rows.get(key)!;
    // Prisma's scalar field-update operators (increment/decrement/set/multiply/divide), e.g.
    // `{ lastValue: { increment: 1 } }` — applied against the CURRENT row, not just overwritten with the
    // operator object, so an atomic counter like ContentSequence actually counts up.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v && typeof v === "object" && !(v instanceof Date) && ["increment", "decrement", "multiply", "divide", "set"].some((op) => op in v)) {
        const op = v as { increment?: number; decrement?: number; multiply?: number; divide?: number; set?: unknown };
        const current = (existing[k] as number) ?? 0;
        clean[k] = op.increment !== undefined ? current + op.increment : op.decrement !== undefined ? current - op.decrement : op.multiply !== undefined ? current * op.multiply : op.divide !== undefined ? current / op.divide : op.set;
      } else {
        clean[k] = v;
      }
    }
    const updated = { ...existing, ...clean, updatedAt: new Date() } as T;
    this.assertUnique(updated, key);
    this.rows.set(key, updated);
    return structuredClone(this.withInclude(updated, include));
  }

  async updateMany({ where, data }: { where: Where; data: Partial<T> }): Promise<{ count: number }> {
    let count = 0;
    for (const [key, row] of this.rows.entries()) {
      if (matches(row, where, this.relations)) {
        this.rows.set(key, { ...row, ...data, updatedAt: new Date() });
        count++;
      }
    }
    return { count };
  }

  async upsert({ where, create, update }: { where: Where; create: Partial<T>; update: Partial<T> }): Promise<T> {
    const key = this.keyFor(where);
    if (key) return this.update({ where, data: update });
    return this.create({ data: create });
  }

  async delete({ where }: { where: Where }): Promise<T> {
    const key = this.keyFor(where);
    if (!key) throw Object.assign(new Error("Record not found"), { code: "P2025" });
    const row = this.rows.get(key)!;
    this.rows.delete(key);
    return structuredClone(row);
  }

  async deleteMany({ where }: { where?: Where } = {}): Promise<{ count: number }> {
    let count = 0;
    for (const [key, row] of [...this.rows.entries()]) {
      if (!where || matches(row, where, this.relations)) {
        this.rows.delete(key);
        count++;
      }
    }
    return { count };
  }

  all(): T[] {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
}

export function createFakePrisma() {
  // Phase 2
  const user = new Table<Row>({
    defaults: { role: "USER", status: "ACTIVE", emailVerified: false, avatarUrl: null, country: null, preferredLanguage: null, subtitleLanguage: null, audioLanguage: null, videoQuality: null, audiobookSpeed: null, lastLoginAt: null, deletedAt: null },
    uniqueSets: [["email"]],
  });
  const authSession = new Table<Row>({ defaults: { revokedAt: null, lastUsedAt: null, ip: null, userAgent: null }, uniqueSets: [["tokenHash"]] });
  const passwordResetToken = new Table<Row>({ defaults: { usedAt: null }, uniqueSets: [["tokenHash"]] });

  // Phase 3
  const contentSequence = new Table<Row>({ keyOf: (d) => String(d.type) });
  const content = new Table<Row>({
    defaults: { status: "DRAFT", visibility: "PUBLIC", ageRestricted: false, territoryMode: "WORLDWIDE", featured: false, trending: false, popular: false, newRelease: false, seoKeywords: [], deletedAt: null, createdById: null },
    uniqueSets: [["contentCode"], ["slug"]],
  });
  const movie = new Table<Row>({
    keyOf: (d) => String(d.contentId),
    defaults: { posterAssetId: null, backdropAssetId: null, thumbnailAssetId: null, masterAssetId: null, trailerAssetId: null, teaserAssetId: null },
  });
  const ebook = new Table<Row>({
    keyOf: (d) => String(d.contentId),
    defaults: { epubAssetId: null, pdfAssetId: null, sampleAssetId: null, frontCoverAssetId: null, backCoverAssetId: null, spineAssetId: null, fullWrapAssetId: null, thumbnailAssetId: null },
  });
  const audiobook = new Table<Row>({
    keyOf: (d) => String(d.contentId),
    defaults: { deliveryMode: "SINGLE_FILE", mainAssetId: null, previewAssetId: null, coverAssetId: null, thumbnailAssetId: null },
  });
  const movieCast = new Table<Row>({ defaults: { displayOrder: 0, characterName: null, imageAssetId: null } });
  const movieCrew = new Table<Row>({ defaults: { displayOrder: 0 } });
  const movieCaption = new Table<Row>({ defaults: { status: "PENDING", mediaAssetId: null }, uniqueSets: [["movieId", "languageId", "type"]] });
  const movieAudioTrack = new Table<Row>({ defaults: { status: "PENDING", mediaAssetId: null }, uniqueSets: [["movieId", "languageId"]] });
  const ebookEdition = new Table<Row>({ defaults: { translator: null, epubAssetId: null, pdfAssetId: null, coverAssetId: null }, uniqueSets: [["ebookId", "languageId"]] });
  const audiobookEdition = new Table<Row>({ defaults: { narratorBio: null, narratorImageAssetId: null, audioAssetId: null, durationSeconds: null }, uniqueSets: [["audiobookId", "languageId"]] });
  const audiobookChapter = new Table<Row>({ defaults: { displayOrder: 0, audioAssetId: null, durationSeconds: null, startTimeSeconds: null, endTimeSeconds: null }, uniqueSets: [["audiobookId", "chapterNumber"]] });
  const language = new Table<Row>({ defaults: { active: true }, uniqueSets: [["code"]] });
  const contentLanguage = new Table<Row>({ uniqueSets: [["contentId", "languageId", "role"]] });
  const genre = new Table<Row>({ defaults: { active: true, description: null, contentType: null }, uniqueSets: [["slug"]] });
  const contentGenre = new Table<Row>({ keyOf: (d) => `${d.contentId}:${d.genreId}` });
  const tag = new Table<Row>({ uniqueSets: [["slug"]] });
  const contentTag = new Table<Row>({ keyOf: (d) => `${d.contentId}:${d.tagId}` });
  const contentWarningType = new Table<Row>({ uniqueSets: [["key"]] });
  const contentWarning = new Table<Row>({ keyOf: (d) => `${d.contentId}:${d.warningTypeId}`, defaults: { notes: null } });
  const contentTerritory = new Table<Row>({ keyOf: (d) => `${d.contentId}:${d.countryCode}` });
  const mediaAsset = new Table<Row>({ defaults: { contentId: null, storageKey: null, status: "PENDING" } });
  const legalDocument = new Table<Row>({ defaults: { currentPublishedVersionId: null, currentDraftVersionId: null }, uniqueSets: [["type"], ["slug"]] });
  const legalDocumentVersion = new Table<Row>({ defaults: { status: "DRAFT", publishedAt: null, createdById: null } });
  const appSetting = new Table<Row>({ keyOf: (d) => String(d.key) });
  const homepageSection = new Table<Row>({ defaults: { enabled: true, displayOrder: 0, itemLimit: 12 }, uniqueSets: [["key"]] });
  const homepageSectionItem = new Table<Row>({ defaults: { displayOrder: 0 }, uniqueSets: [["sectionId", "contentId"]] });
  const collection = new Table<Row>({ defaults: { status: "DRAFT", description: null, bannerAssetId: null }, uniqueSets: [["slug"]] });
  const collectionItem = new Table<Row>({ defaults: { displayOrder: 0 }, uniqueSets: [["collectionId", "contentId"]] });
  const banner = new Table<Row>({ defaults: { active: true, priority: 1, linkedContentId: null } });
  const auditLog = new Table<Row>({ defaults: { userId: null, entityId: null, metadata: null, ip: null, userAgent: null, requestId: null } });

  // Phase 5
  const userSavedContent = new Table<Row>({ uniqueSets: [["userId", "contentId"]] });
  const libraryItem = new Table<Row>({ defaults: { source: null }, uniqueSets: [["userId", "contentId"]] });
  const movieProgress = new Table<Row>({ defaults: { positionSeconds: 0, durationSeconds: null, percentage: 0, completed: false }, uniqueSets: [["userId", "movieId"]] });
  const ebookProgress = new Table<Row>({ defaults: { location: null, page: null, percentage: 0, completed: false }, uniqueSets: [["userId", "ebookId"]] });
  const audiobookProgress = new Table<Row>({ defaults: { chapterId: null, positionSeconds: 0, percentage: 0, completed: false }, uniqueSets: [["userId", "audiobookId"]] });
  const userHistory = new Table<Row>({ defaults: { removedAt: null }, uniqueSets: [["userId", "contentId"]] });
  const ebookBookmark = new Table<Row>({ defaults: { page: null, label: null } });
  const notification = new Table<Row>({ defaults: { readAt: null, metadata: null } });

  // Phase 8
  const userAgeVerification = new Table<Row>({
    defaults: { dateOfBirth: null, verifiedAge: null, method: "SELF_DECLARED", expiresAt: null },
    uniqueSets: [["userId"]],
  });

  // Phase 9
  const analyticsEvent = new Table<Row>({ defaults: { userId: null, contentId: null, metadata: null } });

  // Phase 7
  const plan = new Table<Row>({ defaults: { description: null, stripeProductId: null, trialDays: null, features: [], active: true, displayOrder: 0, maxDevices: null, maxConcurrentStreams: null }, uniqueSets: [["slug"], ["stripePriceId"]] });
  const subscription = new Table<Row>({
    defaults: { currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, trialEnd: null },
    uniqueSets: [["userId"], ["stripeSubscriptionId"]],
  });
  const payment = new Table<Row>({
    defaults: { subscriptionId: null, stripePaymentIntentId: null, stripeInvoiceId: null, stripeChargeId: null, description: null, paidAt: null },
    uniqueSets: [["stripePaymentIntentId"], ["stripeInvoiceId"], ["stripeChargeId"]],
  });
  const refund = new Table<Row>({ defaults: { stripeRefundId: null, reason: null, createdByAdminId: null }, uniqueSets: [["stripeRefundId"]] });
  const stripeEvent = new Table<Row>({ defaults: { processedAt: null, error: null }, uniqueSets: [["stripeEventId"]] });

  // Device management — `lastSeenAt` mirrors the schema's @default(now()), supplied here so the fake
  // applies it on every insert (the create path of upsertDevice doesn't set it explicitly).
  const device = new Table<Row>({
    defaults: { deviceName: null, deviceType: null, platform: null, status: "ACTIVE", lastSeenAt: new Date(), revokedAt: null },
    uniqueSets: [["userId", "deviceIdentifier"]],
  });

  // Playback session tracking — `startedAt`/`lastHeartbeatAt` mirror @default(now()) in the schema.
  const playbackSession = new Table<Row>({
    defaults: { deviceId: null, status: "ACTIVE", startedAt: new Date(), lastHeartbeatAt: new Date(), endedAt: null },
  });

  const tables = {
    user, authSession, passwordResetToken,
    contentSequence, content, movie, ebook, audiobook, movieCast, movieCrew, movieCaption, movieAudioTrack,
    ebookEdition, audiobookEdition, audiobookChapter, language, contentLanguage, genre, contentGenre, tag,
    contentTag, contentWarningType, contentWarning, contentTerritory, mediaAsset, legalDocument, legalDocumentVersion,
    appSetting, homepageSection, homepageSectionItem, collection, collectionItem, banner, auditLog,
    userSavedContent, libraryItem, movieProgress, ebookProgress, audiobookProgress, userHistory, ebookBookmark, notification,
    plan, subscription, payment, refund, stripeEvent,
    // Phase 8
    userAgeVerification,
    // Phase 9
    analyticsEvent,
    // Device & playback session
    device, playbackSession,
  };

  // Declared after every table exists, mirroring the @relation fields in prisma/schema.prisma, so
  // `include: {...}` works the same way it would against the real Prisma Client.
  content.setRelations({
    genres: { kind: "many", table: contentGenre, remoteField: "contentId" },
    tags: { kind: "many", table: contentTag, remoteField: "contentId" },
    languages: { kind: "many", table: contentLanguage, remoteField: "contentId" },
    warnings: { kind: "many", table: contentWarning, remoteField: "contentId" },
    territories: { kind: "many", table: contentTerritory, remoteField: "contentId" },
    movie: { kind: "one", table: movie, remoteField: "contentId" },
    ebook: { kind: "one", table: ebook, remoteField: "contentId" },
    audiobook: { kind: "one", table: audiobook, remoteField: "contentId" },
  });
  contentGenre.setRelations({ genre: { kind: "one", table: genre, localField: "genreId" } });
  contentTag.setRelations({ tag: { kind: "one", table: tag, localField: "tagId" } });
  contentLanguage.setRelations({ language: { kind: "one", table: language, localField: "languageId" } });
  contentWarning.setRelations({ warningType: { kind: "one", table: contentWarningType, localField: "warningTypeId" } });
  // Movie/Ebook/Audiobook are keyed by `contentId`, not `id` — every "many" relation off them must say so
  // explicitly, since the resolver's default `localField` ("id") doesn't exist on these rows.
  movie.setRelations({
    content: { kind: "one", table: content, localField: "contentId" },
    cast: { kind: "many", table: movieCast, localField: "contentId", remoteField: "movieId", orderBy: ["displayOrder", "asc"] },
    crew: { kind: "many", table: movieCrew, localField: "contentId", remoteField: "movieId", orderBy: ["displayOrder", "asc"] },
    captions: { kind: "many", table: movieCaption, localField: "contentId", remoteField: "movieId" },
    audioTracks: { kind: "many", table: movieAudioTrack, localField: "contentId", remoteField: "movieId" },
    // Phase 6: named asset slots — `include: { posterAsset: {...} }` resolves the MediaAsset the FK points at.
    posterAsset: { kind: "one", table: mediaAsset, localField: "posterAssetId" },
    backdropAsset: { kind: "one", table: mediaAsset, localField: "backdropAssetId" },
    thumbnailAsset: { kind: "one", table: mediaAsset, localField: "thumbnailAssetId" },
    masterAsset: { kind: "one", table: mediaAsset, localField: "masterAssetId" },
    trailerAsset: { kind: "one", table: mediaAsset, localField: "trailerAssetId" },
    teaserAsset: { kind: "one", table: mediaAsset, localField: "teaserAssetId" },
  });
  ebook.setRelations({
    content: { kind: "one", table: content, localField: "contentId" },
    editions: { kind: "many", table: ebookEdition, localField: "contentId", remoteField: "ebookId" },
    epubAsset: { kind: "one", table: mediaAsset, localField: "epubAssetId" },
    pdfAsset: { kind: "one", table: mediaAsset, localField: "pdfAssetId" },
    sampleAsset: { kind: "one", table: mediaAsset, localField: "sampleAssetId" },
    frontCoverAsset: { kind: "one", table: mediaAsset, localField: "frontCoverAssetId" },
    backCoverAsset: { kind: "one", table: mediaAsset, localField: "backCoverAssetId" },
    spineAsset: { kind: "one", table: mediaAsset, localField: "spineAssetId" },
    fullWrapAsset: { kind: "one", table: mediaAsset, localField: "fullWrapAssetId" },
    thumbnailAsset: { kind: "one", table: mediaAsset, localField: "thumbnailAssetId" },
  });
  audiobook.setRelations({
    content: { kind: "one", table: content, localField: "contentId" },
    editions: { kind: "many", table: audiobookEdition, localField: "contentId", remoteField: "audiobookId" },
    chapters: { kind: "many", table: audiobookChapter, localField: "contentId", remoteField: "audiobookId", orderBy: ["chapterNumber", "asc"] },
    mainAsset: { kind: "one", table: mediaAsset, localField: "mainAssetId" },
    previewAsset: { kind: "one", table: mediaAsset, localField: "previewAssetId" },
    coverAsset: { kind: "one", table: mediaAsset, localField: "coverAssetId" },
    thumbnailAsset: { kind: "one", table: mediaAsset, localField: "thumbnailAssetId" },
  });
  audiobookChapter.setRelations({ audioAsset: { kind: "one", table: mediaAsset, localField: "audioAssetId" } });
  movieCaption.setRelations({ language: { kind: "one", table: language, localField: "languageId" }, mediaAsset: { kind: "one", table: mediaAsset, localField: "mediaAssetId" } });
  movieAudioTrack.setRelations({ language: { kind: "one", table: language, localField: "languageId" }, mediaAsset: { kind: "one", table: mediaAsset, localField: "mediaAssetId" } });
  movieCast.setRelations({ movie: { kind: "one", table: movie, localField: "movieId", remoteField: "contentId" } });
  movieCrew.setRelations({ movie: { kind: "one", table: movie, localField: "movieId", remoteField: "contentId" } });
  homepageSectionItem.setRelations({ content: { kind: "one", table: content, localField: "contentId" } });
  collectionItem.setRelations({ content: { kind: "one", table: content, localField: "contentId" } });
  banner.setRelations({ linkedContent: { kind: "one", table: content, localField: "linkedContentId" } });
  legalDocument.setRelations({
    currentPublishedVersion: { kind: "one", table: legalDocumentVersion, localField: "currentPublishedVersionId" },
    currentDraftVersion: { kind: "one", table: legalDocumentVersion, localField: "currentDraftVersionId" },
  });

  // Phase 6: the reverse of every named asset slot — lets `isReferenced()` check "is this MediaAsset
  // still wired into a slot anywhere" with one query, matching the real schema's back-relations.
  mediaAsset.setRelations({
    movieCaptionFor: { kind: "one", table: movieCaption, remoteField: "mediaAssetId" },
    movieAudioTrackFor: { kind: "one", table: movieAudioTrack, remoteField: "mediaAssetId" },
    movieCastImageFor: { kind: "one", table: movieCast, remoteField: "imageAssetId" },
    ebookEpubFor: { kind: "one", table: ebookEdition, remoteField: "epubAssetId" },
    ebookPdfFor: { kind: "one", table: ebookEdition, remoteField: "pdfAssetId" },
    ebookCoverFor: { kind: "one", table: ebookEdition, remoteField: "coverAssetId" },
    audiobookNarratorImageFor: { kind: "one", table: audiobookEdition, remoteField: "narratorImageAssetId" },
    audiobookAudioFor: { kind: "one", table: audiobookEdition, remoteField: "audioAssetId" },
    audiobookChapterFor: { kind: "one", table: audiobookChapter, remoteField: "audioAssetId" },
    collectionBannerFor: { kind: "one", table: collection, remoteField: "bannerAssetId" },
    bannerDesktopFor: { kind: "one", table: banner, remoteField: "desktopAssetId" },
    bannerMobileFor: { kind: "one", table: banner, remoteField: "mobileAssetId" },
    moviePosterFor: { kind: "one", table: movie, remoteField: "posterAssetId" },
    movieBackdropFor: { kind: "one", table: movie, remoteField: "backdropAssetId" },
    movieThumbnailFor: { kind: "one", table: movie, remoteField: "thumbnailAssetId" },
    movieMasterFor: { kind: "one", table: movie, remoteField: "masterAssetId" },
    movieTrailerFor: { kind: "one", table: movie, remoteField: "trailerAssetId" },
    movieTeaserFor: { kind: "one", table: movie, remoteField: "teaserAssetId" },
    ebookPrimaryEpubFor: { kind: "one", table: ebook, remoteField: "epubAssetId" },
    ebookPrimaryPdfFor: { kind: "one", table: ebook, remoteField: "pdfAssetId" },
    ebookSampleFor: { kind: "one", table: ebook, remoteField: "sampleAssetId" },
    ebookFrontCoverFor: { kind: "one", table: ebook, remoteField: "frontCoverAssetId" },
    ebookBackCoverFor: { kind: "one", table: ebook, remoteField: "backCoverAssetId" },
    ebookSpineFor: { kind: "one", table: ebook, remoteField: "spineAssetId" },
    ebookFullWrapFor: { kind: "one", table: ebook, remoteField: "fullWrapAssetId" },
    ebookThumbnailFor: { kind: "one", table: ebook, remoteField: "thumbnailAssetId" },
    audiobookMainFor: { kind: "one", table: audiobook, remoteField: "mainAssetId" },
    audiobookPreviewFor: { kind: "one", table: audiobook, remoteField: "previewAssetId" },
    audiobookCoverFor: { kind: "one", table: audiobook, remoteField: "coverAssetId" },
    audiobookThumbnailFor: { kind: "one", table: audiobook, remoteField: "thumbnailAssetId" },
  });

  // Phase 5
  userSavedContent.setRelations({ content: { kind: "one", table: content, localField: "contentId" } });
  libraryItem.setRelations({ content: { kind: "one", table: content, localField: "contentId" } });
  userHistory.setRelations({ content: { kind: "one", table: content, localField: "contentId" } });
  movieProgress.setRelations({ movie: { kind: "one", table: movie, localField: "movieId", remoteField: "contentId" } });
  ebookProgress.setRelations({ ebook: { kind: "one", table: ebook, localField: "ebookId", remoteField: "contentId" } });
  audiobookProgress.setRelations({ audiobook: { kind: "one", table: audiobook, localField: "audiobookId", remoteField: "contentId" } });

  // Phase 8
  userAgeVerification.setRelations({ user: { kind: "one", table: user, localField: "userId" } });

  // Phase 7
  subscription.setRelations({ plan: { kind: "one", table: plan, localField: "planId" }, user: { kind: "one", table: user, localField: "userId" } });
  payment.setRelations({
    subscription: { kind: "one", table: subscription, localField: "subscriptionId" },
    user: { kind: "one", table: user, localField: "userId" },
    refunds: { kind: "many", table: refund, remoteField: "paymentId" },
  });
  refund.setRelations({ payment: { kind: "one", table: payment, localField: "paymentId" }, createdByAdmin: { kind: "one", table: user, localField: "createdByAdminId" } });

  // Device & playback session
  device.setRelations({ user: { kind: "one", table: user, localField: "userId" } });
  playbackSession.setRelations({
    user: { kind: "one", table: user, localField: "userId" },
    device: { kind: "one", table: device, localField: "deviceId" },
  });

  return {
    ...tables,
    $queryRaw: async () => [{ "?column?": 1 }],
    $disconnect: async () => undefined,
    // not a real transaction (no rollback) — see the module doc comment
    $transaction: async <T>(fn: (tx: typeof tables) => Promise<T>) => fn(tables),
    __reset() {
      for (const t of Object.values(tables)) t.clear();
    },
  };
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;
