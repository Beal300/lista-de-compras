import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppState } from '../src/domain/models';
import type { Action } from '../src/domain/commands';

export interface TestApp { origin: string; password: string }
export const test = base.extend<{ app: TestApp }>({
  app: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'shopping-browser-'));
    const password = `test-${randomUUID()}`;
    const child = fork(resolve('tests/serve.ts'), [], { execArgv: ['--import', 'tsx'], env: { ...process.env, TEST_DATABASE: join(dir, 'db.sqlite'), TEST_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    const logs: string[] = []; child.stderr?.on('data', data => logs.push(String(data)));
    try {
      const origin = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Servidor de teste não iniciou: ${logs.join('')}`)), 15000);
        child.once('message', message => { clearTimeout(timer); resolve((message as { origin: string }).origin); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor encerrou (${code}): ${logs.join('')}`)); });
      });
      await use({ origin, password });
    } finally {
      if (child.exitCode === null) await new Promise<void>(resolve => {
        const timer = setTimeout(() => { child.kill(); resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); }); if (child.connected) child.send('stop'); else child.kill();
      });
      rmSync(dir, { recursive: true, force: true });
    }
  },
});
export { expect };
export async function snapshot(page: Page, app: TestApp): Promise<AppState> { const response = await page.request.get(`${app.origin}/api/state`); expect(response.ok()).toBeTruthy(); return response.json(); }
export async function command(request: APIRequestContext, app: TestApp, action: Action, revision: number, operationId = randomUUID()) {
  return request.post(`${app.origin}/api/commands`, { headers: { Origin: app.origin, 'X-Shopping-Request': '1' }, data: { operationId, expectedRevision: revision, action } });
}
export async function login(page: Page, app: TestApp, previousPurchase = false) {
  await page.goto(app.origin);
  await page.getByLabel('Senha compartilhada').fill(app.password); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha compra', exact: true })).toBeVisible();
  if (previousPurchase) {
    const seed = JSON.parse(readFileSync(resolve('src/data/seed.json'), 'utf8')) as { products: { id: string; initialQuantity: number }[] };
    let state = await snapshot(page, app);
    const response = await command(page.request, app, { type: 'reviewSelection', listId: state.lists[0].id, selection: Object.fromEntries(seed.products.filter(p => p.initialQuantity > 0).map(p => [p.id, p.initialQuantity])) }, state.revision);
    expect(response.ok()).toBeTruthy(); state = (await response.json()).state;
    for (const item of state.items) {
      const response = await command(page.request, app, { type: 'updateItem', listId: item.listId, itemId: item.id, patch: { status: 'in_cart' } }, state.revision);
      expect(response.ok()).toBeTruthy(); state = (await response.json()).state;
    }
    await page.reload(); await expect(page.locator('.shopping-row.in-cart')).toHaveCount(17);
  }
}
