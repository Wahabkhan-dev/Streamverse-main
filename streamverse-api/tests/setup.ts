// Safe, fake values: tests never touch a real database, Stripe or storage.
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "4000";
process.env["DATABASE_URL"] = "mysql://test:test@localhost:3306/streamverse_test";
process.env["FRONTEND_URL"] = "http://localhost:5173";
process.env["ALLOWED_ORIGINS"] = "http://localhost:5180";
process.env["JWT_SECRET"] = "test-jwt-secret-test-jwt-secret-0001";
process.env["JWT_REFRESH_SECRET"] = "test-jwt-refresh-secret-test-0002";
// Phase 6: the local filesystem storage adapter, pointed at a scratch dir so tests never touch real S3.
process.env["STORAGE_PROVIDER"] = "local";
process.env["LOCAL_STORAGE_DIR"] = "./.data/test-media";
process.env["QUEUE_DRIVER"] = "inline";
// Phase 7: Stripe is never actually called in tests — services/stripe/stripe.service.ts is mocked via
// vi.mock the same way storage/media processing are. These just need to satisfy env validation.
process.env["STRIPE_SECRET_KEY"] = "sk_test_fake_key_for_tests_only_000000";
process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test_fake_secret_for_tests_only";
process.env["STRIPE_SUCCESS_URL"] = "http://localhost:5173/billing/success";
process.env["STRIPE_CANCEL_URL"] = "http://localhost:5173/billing/cancel";
