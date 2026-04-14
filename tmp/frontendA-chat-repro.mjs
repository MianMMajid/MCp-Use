import { chromium } from '@playwright/test';

const gatewayBase = 'http://127.0.0.1:3000';
const frontendBase = 'http://127.0.0.1:4101';

async function login() {
  const response = await fetch(`${gatewayBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const body = await response.json().catch(() => ({}));
  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(/maple_session=([^;]+)/);
  if (!response.ok || !match) {
    throw new Error(`Login failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return match[1];
}

async function main() {
  const sessionId = await login();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const events = [];
  const watchdog = setTimeout(() => {
    console.log(JSON.stringify([...events, { type: 'global-timeout' }], null, 2));
    process.exit(124);
  }, 25_000);

  page.setDefaultTimeout(10_000);

  page.on('console', (msg) => {
    events.push({ type: 'console', level: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    events.push({ type: 'pageerror', text: String(error?.stack || error) });
  });
  page.on('requestfailed', (req) => {
    events.push({ type: 'requestfailed', url: req.url(), error: req.failure()?.errorText || '' });
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/chat/stream') || url.includes('/api/auth/me') || url.endsWith('/maple/chat')) {
      events.push({
        type: 'response',
        url,
        status: res.status(),
        contentType: res.headers()['content-type'] || '',
      });
    }
  });

  await context.addCookies([{ name: 'maple_session', value: sessionId, url: frontendBase }]);

  try {
    await page.goto(`${frontendBase}/maple/chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    events.push({
      type: 'loaded',
      url: page.url(),
      body: (await page.locator('body').innerText()).slice(0, 600),
    });

    await page.locator('textarea').first().fill('Explain the current risk posture in two short paragraphs.');
    try {
      const clickResult = await Promise.race([
        page.evaluate(() => {
          document.querySelector('button[aria-label="Send"]')?.click();
          return 'click-dispatched';
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Click dispatch timed out after 5s')), 5_000);
        }),
      ]);
      events.push({ type: 'dom-clicked', result: clickResult });
    } catch (error) {
      events.push({ type: 'dom-click-failed', text: String(error?.stack || error) });
    }

    await page.waitForTimeout(8_000);

    try {
      const probe = await Promise.race([
        page.evaluate(() => ({
          href: location.href,
          title: document.title,
          body: document.body.innerText.slice(0, 1600),
          buttonCount: document.querySelectorAll('button').length,
          textareaDisabled: document.querySelector('textarea')?.disabled ?? null,
          sendButtonExists: Boolean(document.querySelector('button[aria-label="Send"]')),
          stopButtonExists: Boolean(document.querySelector('button[aria-label="Stop"]')),
        })),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Probe timed out after 5s')), 5_000);
        }),
      ]);
      events.push({ type: 'probe', ...probe });
    } catch (error) {
      events.push({ type: 'probe-failed', text: String(error?.stack || error) });
    }
  } catch (error) {
    events.push({ type: 'fatal', text: String(error?.stack || error) });
  } finally {
    clearTimeout(watchdog);
    console.log(JSON.stringify(events, null, 2));
    await browser.close();
  }
}

await main();
