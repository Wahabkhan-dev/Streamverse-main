// Isolated characterization checks: passing means the stated failure path was reproduced.
// No database, network, email, or payment-provider operations are performed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('./streamverse/node_modules/typescript/lib/typescript.js');
function load(file, mocks) {
  const source = fs.readFileSync(path.join('streamverse-api/src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unmocked dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
const logger = { info() {}, warn() {}, error() {} };
test('fully refunded charge is excluded from gross but its refund is still subtracted', async () => {
  const repo = load('repositories/analytics.repository.ts', { '../config/database': { prisma: {
    payment: { findMany: async ({ where }) => { assert.equal(where.status, 'SUCCEEDED'); return []; } },
    refund: { findMany: async () => [{ amount: 1000 }] },
  } } });
  assert.equal((await repo.getRevenueSummary()).totalRevenueCents, -1000);
});
test('cleanup discards tracking row when storage deletion fails', async () => {
  let deleted = false;
  const svc = load('services/media/mediaCleanup.service.ts', {
    '../../config/env': { env: { MEDIA_CLEANUP_GRACE_SECONDS: 60 } }, '../../config/logger': { logger },
    '../../repositories/mediaAsset.repository': { findExpiredPending: async () => [{ id: 'a', storageKey: 'k' }], findDeletedPastGrace: async () => [], hardDelete: async () => { deleted = true; } },
    './assetSlots': { usedAssetIds: async () => new Set() },
    '../storage': { getStorageProvider: () => ({ deleteObject: async () => { throw new Error('storage down'); } }) },
  });
  await svc.runMediaCleanup(); assert.equal(deleted, true);
});
test('video job resolves successfully despite processing failure', async () => {
  let status;
  const svc = load('services/media/videoProcessing.service.ts', {
    '../../repositories/mediaAsset.repository': { findById: async () => ({ status: 'UPLOADED', storageKey: 'k' }), update: async (_id, data) => { status = data.status; }, listRenditions: async () => [] },
    '../../config/logger': { logger }, '.': { getMediaProcessor: () => ({ probe: async () => { throw new Error('probe down'); } }) },
    './mediaProcessor.provider': {}, './storageKey.service': {}, '../storage': { getStorageProvider: () => ({ createDownloadUrl: async () => 'https://example.invalid' }) },
  });
  await assert.doesNotReject(() => svc.processVideoAsset('a')); assert.equal(status, 'FAILED');
});
test('external refund is ignored without looking up its known payment', async () => {
  let lookedUp = false;
  const svc = load('services/billing/refund.service.ts', {
    '../../repositories/payment.repository': { findById: async () => { lookedUp = true; } },
    '../../repositories/refund.repository': { findByStripeRefundId: async () => null },
    '../../utils/errors': {}, '../auditLog.service': {}, '../notification.service': {}, '../stripe/stripe.service': {},
  });
  await svc.applyStripeRefundEvent({ id: 'external', status: 'succeeded', payment_intent: 'known' }); assert.equal(lookedUp, false);
});
function auth(sessions, resets, users, tokens, passwords) {
  return load('services/auth.service.ts', {
    '../config/logger': { logger }, '../utils/errors': { UnauthorizedError: Error, ValidationError: Error, ConflictError: Error }, '../constants/errors': { ERROR_CODES: {} }, '../config/env': { env: {} },
    '../utils/email': { normalizeEmail: s => s.toLowerCase().trim() }, '../utils/tokens': { sha256Hex: s => s },
    '../repositories/authSession.repository': sessions, '../repositories/passwordReset.repository': resets, '../repositories/user.repository': users,
    './authAudit.service': { logAuthEvent() {} }, './email.service': {}, './password.service': passwords, './token.service': tokens,
    './user.service': { serializeUser: u => u }, './settings/appSettings.service': {},
  });
}
test('two simultaneous uses of one refresh token both create a successor', async () => {
  let count = 0;
  const svc = auth({ findByTokenHash: async () => ({ id: 's', userId: 'u', revokedAt: null, expiresAt: new Date(Date.now() + 60000) }), markUsedAndRevoke: async () => {}, create: async () => { count++; } }, {},
    { findById: async () => ({ id: 'u', status: 'ACTIVE', role: 'USER' }) }, { signAccessToken: () => 'a', issueRefreshToken: () => ({ token: 'r', tokenHash: 'h', expiresAt: new Date() }) }, {});
  await Promise.all([svc.refresh('same', { get() {} }), svc.refresh('same', { get() {} })]); assert.equal(count, 2);
});
test('reset changes password even when session revocation fails', async () => {
  let changed = false;
  const svc = auth({ revokeAllForUser: async () => { throw new Error('revocation down'); } }, { findByTokenHash: async () => ({ id: 'r', userId: 'u', usedAt: null, expiresAt: new Date(Date.now() + 60000) }), markUsed: async () => {}, invalidateAllForUser: async () => {} },
    { updatePasswordHash: async () => { changed = true; } }, {}, { hashPassword: async () => 'hash' });
  await assert.rejects(() => svc.resetPassword('r', 'password', {}), /revocation down/); assert.equal(changed, true);
});
test('legacy content-scoped movie uploads collide; library uploads no longer collide', () => {
  const keys = load('services/media/storageKey.service.ts', { 'node:crypto': require('node:crypto') });
  assert.equal(keys.masterPlaylistKey('content/c/movie/master/A.mp4'), keys.masterPlaylistKey('content/c/movie/master/B.mp4'));
  assert.notEqual(keys.masterPlaylistKey('media/movie/master/A.mp4'), keys.masterPlaylistKey('media/movie/master/B.mp4'));
});
test('login limiting treats case/whitespace variants of the same normalized account as different buckets', () => {
  const mod = load('middleware/rateLimit.middleware.ts', { 'express-rate-limit': { rateLimit: o => o }, '../config/env': { env: { RATE_LIMIT_MULTIPLIER: 1 } }, '../constants/errors': { ERROR_CODES: {} }, '../utils/apiResponse': {} });
  const limiter = mod.loginLimiter(); const request = email => ({ ip: '127.0.0.1', body: { email } });
  assert.notEqual(limiter.keyGenerator(request('ALICE@example.com')), limiter.keyGenerator(request('alice@example.com')));
});
test('expired age verification is accepted by entitlement evaluator', async () => {
  const svc = load('services/entitlement/entitlement.service.ts', {
    '../../repositories/entitlement.repository': { findContentForEntitlement: async () => ({ status: 'PUBLISHED', deletedAt: null, visibility: 'PUBLIC', territoryMode: 'WORLDWIDE', territories: [], ageRestricted: true, minimumAge: 18 }) },
    '../../repositories/ageVerification.repository': { findByUserId: async () => ({ dateOfBirth: new Date('1980-01-01'), expiresAt: new Date('2000-01-01') }) },
    '../billing/subscriptionAccess.service': {}, './entitlementCache.service': { cacheKey: () => 'key', get: () => undefined, set() {} }, './accessAudit.service': { logAccess() {} },
  });
  assert.equal((await svc.checkAccess({ userId: 'u', accountStatus: 'ACTIVE' }, 'c', 'movie')).canConsume, true);
});
test('profile country labels and selectable 1080p quality fail backend validation', () => {
  const { profileUpdateSchema } = load('validators/user.validator.ts', { zod: require('./streamverse-api/node_modules/zod') });
  assert.equal(profileUpdateSchema.safeParse({ fullName: 'Example User', country: 'United Kingdom', videoQuality: '1080p' }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ fullName: 'Example User', country: 'GB', videoQuality: 'HD' }).success, true);
});
test('registering a revoked device reports success but leaves the device revoked', async () => {
  let record = { id: 'device', status: 'REVOKED', revokedAt: new Date() };
  const client = { device: {
    findUnique: async () => record, count: async () => 0,
    upsert: async ({ update }) => { record = { ...record, ...update }; return record; },
  } };
  const repo = load('repositories/device.repository.ts', { '../config/database': { prisma: client } });
  const svc = load('services/device.service.ts', {
    '../repositories/device.repository': repo,
    '../repositories/subscription.repository': { findByUserId: async () => ({ plan: { maxDevices: 2 } }) },
    '../repositories/userLock.repository': { runLockedForUser: async (_id, fn) => fn(client) },
    '../constants/errors': { ERROR_CODES: {} }, '../utils/errors': { AppError: Error, NotFoundError: Error },
  });
  assert.equal((await svc.registerDevice('user', 'same-device', {})).status, 'REVOKED');
});
test('settings batch applies the first setting before rejecting an invalid later value', async () => {
  const applied = [];
  const svc = load('services/settings/appSettings.service.ts', {
    '../settings.service': { setSetting: async value => { if (typeof value.value !== 'boolean') throw new Error('expected boolean'); applied.push(value); } },
    '../../config/settings.registry': {}, '../../utils/errors': { ValidationError: Error },
    '../../validators/settings.validator': { SETTING_KEYS: ['maintenanceMode', 'registrationEnabled'] },
  });
  await assert.rejects(() => svc.updateSettings([{ key: 'maintenanceMode', value: true }, { key: 'registrationEnabled', value: 'invalid' }]), /expected boolean/);
  assert.equal(applied.length, 1);
});
test('CSV export leaves a user-controlled spreadsheet formula executable', () => {
  const source = fs.readFileSync('streamverse/src/lib/csv.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  assert.equal(mod.exports.toCsv([['Name'], ['=1+1']]), 'Name\n=1+1');
});
