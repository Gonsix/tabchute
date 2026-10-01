import { chromium, expect, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const extension = resolve('dist');
const bravePath = process.env.BRAVE_PATH ?? (process.platform === 'darwin' ? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' : process.platform === 'win32' ? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' : '/usr/bin/brave-browser');
const browsers = [{ name: 'chrome', executablePath: chromium.executablePath() }, ...(existsSync(bravePath) ? [{ name: 'brave', executablePath: bravePath }] : [])];
if (!existsSync(bravePath)) console.log('Brave not found; set BRAVE_PATH to include it.');
await mkdir('test-results', { recursive: true });
const server = Bun.serve({ port: 0, fetch: request => new Response(`<html><head><title>${new URL(request.url).pathname}</title></head><body>TabChute test site</body></html>`, { headers: { 'Content-Type': 'text/html' } }) });
try {
  for (const browser of browsers) {
    const profile = await mkdtemp(join(tmpdir(), 'tabchute-check-'));
    let context: BrowserContext | undefined;
    try {
      const launch = () => chromium.launchPersistentContext(profile, {
        executablePath: browser.executablePath, headless: true,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', '--no-default-browser-check'],
        viewport: { width: 1000, height: 1000 }
      });
      context = await launch();
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
      const id = new URL(worker.url()).host;
      const base = `chrome-extension://${id}`;
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      await page.goto(`${base}/editor.html`);
      await expect(page.locator('#fields')).toBeEnabled();
      await page.locator('#save').click();
      await expect(page.locator('#name-error')).toContainText('name');
      await page.locator('#name').fill('Research');
      await page.locator('input[type=url]').fill(`http://localhost:${server.port}/one`);
      await page.getByLabel('Display name (optional)').fill('Paper search');
      await page.locator('#add').click();
      await page.locator('input[type=url]').nth(1).fill(`http://localhost:${server.port}/two`);
      await page.getByRole('button', { name: 'Move site 2 up' }).click();
      await expect(page.locator('input[type=url]').first()).toHaveValue(`http://localhost:${server.port}/two`);
      await page.locator('.drag-handle').first().dragTo(page.locator('.site-card').nth(1));
      await expect(page.locator('input[type=url]').first()).toHaveValue(`http://localhost:${server.port}/one`);
      await page.getByRole('button', { name: 'Move site 2 up' }).click();
      await page.getByRole('radio', { name: 'Pink', exact: true }).click();
      await page.getByRole('radio', { name: 'Pink', exact: true }).press('ArrowRight');
      await expect(page.getByRole('radio', { name: 'Purple', exact: true })).toHaveAttribute('aria-checked', 'true');
      await page.locator('#save').click();
      await expect(page.locator('#success')).toContainText('saved');
      const templateId = new URL(page.url()).searchParams.get('id')!;
      await page.locator('.favicon').first().evaluate(node => { (node as HTMLImageElement).src = chrome.runtime.getURL('missing-icon.png'); });
      await expect(page.locator('.favicon').first()).toHaveAttribute('src', `${base}/site.svg`);
      await page.screenshot({ path: `test-results/${browser.name}-editor-light.png`, fullPage: true, animations: 'disabled' });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: `test-results/${browser.name}-editor-dark.png`, fullPage: true, animations: 'disabled' });
      // Reopening reads persisted values and IDs, rather than the editor's local draft.
      const editor2 = await context.newPage(); await editor2.goto(`${base}/editor.html?id=${templateId}`);
      await expect(editor2.locator('#name')).toHaveValue('Research');
      await expect(editor2.locator('input[type=url]').first()).toHaveValue(`http://localhost:${server.port}/two`);
      // Conflicting edits retain the newer saved version.
      await editor2.locator('#name').fill('Research updated'); await editor2.locator('#save').click(); await expect(editor2.locator('#success')).toBeVisible();
      await page.locator('#name').fill('Stale editor'); await page.locator('#save').click();
      await expect(page.locator('#error')).toContainText('changed in another tab');
      const popup = await context.newPage(); await popup.goto(`${base}/popup.html`);
      await expect(popup.locator('.group-name')).toHaveText('Research updated');
      await popup.setViewportSize({ width: 380, height: 600 });
      await popup.screenshot({ path: `test-results/${browser.name}-popup-light.png`, fullPage: true, animations: 'disabled' });
      await popup.emulateMedia({ colorScheme: 'dark' });
      await popup.screenshot({ path: `test-results/${browser.name}-popup-dark.png`, fullPage: true, animations: 'disabled' });
      await popup.getByRole('button', { name: 'Open Research updated', exact: true }).click();
      await expect.poll(async () => worker.evaluate(async () => (await chrome.storage.session.get('tabchuteJob')).tabchuteJob)).toMatchObject({ status: 'complete', failures: [], errors: [] });
      const check = await worker.evaluate(async () => {
        const groups = await chrome.tabGroups.query({});
        const group = groups.find(g => g.title === 'Research updated')!;
        const tabs = await chrome.tabs.query({ groupId: group.id });
        const job = (await chrome.storage.session.get('tabchuteJob')).tabchuteJob as { createdTabIds: number[] };
        return { group, tabs: tabs.map(t => ({ id: t.id, active: t.active, index: t.index })), job };
      });
      expect(check.group.color).toBe('purple'); expect(check.group.collapsed).toBe(false);
      expect(check.tabs.map(t => t.id)).toEqual(check.job.createdTabIds);
      expect(check.tabs[0].active).toBe(true);
      // Start again, then close the initiating page before completion.
      await popup.bringToFront(); await popup.getByRole('button', { name: 'Open Research updated', exact: true }).click(); await popup.close();
      await expect.poll(async () => worker.evaluate(async () => (await chrome.tabGroups.query({})).filter(g => g.title === 'Research updated').length)).toBe(2);
      const reopened = await context.newPage(); await reopened.goto(`${base}/popup.html`); await expect(reopened.locator('#job')).toContainText('2 sites opened');
      editor2.on('dialog', dialog => { void dialog.accept(); }); await editor2.locator('#delete').click();
      await expect(reopened.locator('.empty')).toBeVisible();
      expect(await worker.evaluate(async () => (await chrome.tabGroups.query({})).filter(g => g.title === 'Research updated').length)).toBe(2);
      expect(pageErrors).toEqual([]);
      // Store a template, then restart the same isolated browser profile.
      await reopened.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: 'save', group: { id: 'restart', name: 'Persisted group', color: 'blue', revision: 0, sites: [{ id: 'site', url: 'https://example.com/' }] } });
      });
      await context.close(); context = await launch();
      const afterRestart = await context.newPage(); await afterRestart.goto(`${base}/popup.html`);
      await expect(afterRestart.locator('.group-name')).toHaveText('Persisted group');
      await expect(afterRestart.locator('#job')).toBeHidden();
      console.log(`${browser.name}: extension CRUD, conflict, ordering, opening, repeat opening, closed-page completion, deletion isolation, restart persistence and both themes passed (${context.browser()?.version()}).`);
    } finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
  }
} finally { server.stop(); }
