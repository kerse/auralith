import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const results = [];
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto('http://127.0.0.1:4173');
    await page.waitForSelector('html[data-app-ready="true"]');
    await page.screenshot({ path: `test-results/${channel}-stage0.png`, fullPage: true });
    if (errors.length) throw new Error(errors.join('\n'));
    results.push({ channel, version: browser.version(), title: await page.title(), errors });
  } finally { await browser.close(); }
}
await writeFile('test-results/browser-smoke.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
