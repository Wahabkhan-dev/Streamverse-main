const fs = require('node:fs');
const { chromium } = require('./streamverse/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const results = [];
  let errors = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 500)));
  for (const route of ['/', '/movies', '/ebooks', '/audiobooks', '/sign-in', '/privacy-policy', '/downloads', '/admin']) {
    errors = [];
    try {
      const response = await page.goto('http://127.0.0.1:8080' + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1800);
      const body = await page.locator('body').innerText();
      results.push({ route, status: response?.status(), finalPath: new URL(page.url()).pathname, title: await page.title(), bodyLength: body.length, heading: await page.locator('h1').allTextContents(), errors: [...errors], visibleErrorBoundary: /Something went wrong|An unexpected error occurred/i.test(body) });
    } catch (error) {
      results.push({ route, error: error.message.slice(0, 350), errors: [...errors] });
    }
  }
  await browser.close();
  fs.writeFileSync('AUDIT-BROWSER.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
