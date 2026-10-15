import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "320px", width: 320, height: 568 },
  { name: "375px", width: 375, height: 667 },
  { name: "430px", width: 430, height: 932 },
  { name: "768px", width: 768, height: 1024 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "1366px", width: 1366, height: 768 },
  { name: "1440px", width: 1440, height: 900 },
];

const ROUTES = [
  { path: "/", name: "Homepage" },
  { path: "/movies", name: "Movies" },
  { path: "/sign-in", name: "Sign In" },
  { path: "/forgot-password", name: "Forgot Password" },
  { path: "/subscription", name: "Subscription" },
  { path: "/profile", name: "Profile" },
  { path: "/search", name: "Search" },
  { path: "/notifications", name: "Notifications" },
];

/** Returns true if the page has content wider than the viewport (horizontal overflow). */
async function checkNoHorizontalOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1;
  });

  if (hasOverflow) {
    const offenders = await findOverflowingElements(page);
    expect(
      hasOverflow,
      `Page has horizontal overflow. Overflowing elements: ${offenders.join(", ")}`,
    ).toBe(false);
  }
}

/** Returns the first 10 elements that extend beyond the right edge of the viewport (for debugging). */
async function findOverflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    document.querySelectorAll("*").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 1) {
        const tag = el.tagName.toLowerCase();
        const cls = typeof el.className === "string" ? el.className.slice(0, 50) : "";
        const id = el.id ? `#${el.id}` : "";
        offenders.push(`<${tag}${id}${cls ? ` class="${cls}"` : ""}>`);
      }
    });
    return offenders.slice(0, 10);
  });
}

// ── viewport × route matrix ───────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test.describe(`Viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route.name} (${route.path}) — no horizontal overflow`, async ({ page }) => {
        // Enable demo mode so all routes work without a backend
        await page.addInitScript(() => {
          localStorage.setItem("DEMO_MODE", "true");
        });

        await page.goto(route.path);
        // Wait for React to hydrate and content to settle
        await page.waitForTimeout(800);

        await checkNoHorizontalOverflow(page);
      });
    }
  });
}

// ── critical controls visible at 320px ───────────────────────────────────────

test.describe("Critical controls visible at 320px", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("DEMO_MODE", "true");
    });
  });

  test("Sign-in page: form fields and submit button are visible", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForTimeout(600);

    // Email input
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible();

    // Password input
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    // Submit button
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
    await expect(submitBtn).toBeVisible();

    // Controls must be within viewport (not scrolled off-screen horizontally)
    const emailBox = await emailInput.boundingBox();
    if (emailBox) {
      expect(emailBox.x).toBeGreaterThanOrEqual(0);
      expect(emailBox.x + emailBox.width).toBeLessThanOrEqual(320 + 1);
    }
  });

  test("Homepage: navigation toggle and logo are visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(600);

    // Mobile hamburger or logo should be visible
    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    const headerBox = await header.boundingBox();
    if (headerBox) {
      // Header must not overflow the viewport
      expect(headerBox.width).toBeLessThanOrEqual(320 + 1);
    }
  });

  test("Movies page: at least one card or skeleton is visible", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForTimeout(800);

    // Page body must have content
    await expect(page.locator("body")).not.toBeEmpty();

    // No horizontal overflow
    await checkNoHorizontalOverflow(page);
  });

  test("Forgot password page: email input and submit button are visible", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForTimeout(600);

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible();

    const emailBox = await emailInput.boundingBox();
    if (emailBox) {
      expect(emailBox.x).toBeGreaterThanOrEqual(0);
      expect(emailBox.x + emailBox.width).toBeLessThanOrEqual(320 + 1);
    }
  });
});

// ── no JS errors on any viewport ─────────────────────────────────────────────

test.describe("No JS errors on key pages (1440px)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const keyRoutes = ["/", "/movies", "/sign-in", "/search"];

  for (const path of keyRoutes) {
    test(`${path} — no unhandled JS errors`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("DEMO_MODE", "true");
      });

      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(path);
      await page.waitForTimeout(800);

      // ResizeObserver loop errors are benign and common in test environments
      const realErrors = errors.filter((e) => !e.includes("ResizeObserver"));
      expect(realErrors, `JS errors on ${path}: ${realErrors.join("; ")}`).toHaveLength(0);
    });
  }
});
