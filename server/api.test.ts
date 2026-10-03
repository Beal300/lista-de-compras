import * as nfce from './nfce';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import { Store } from './store';
import { Auth } from './auth';
import { createApp } from './app';

const cleanup: (() => Promise<void>)[] = [];
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'shopping-api-')); const store = new Store(join(dir, 'db.sqlite'));
  new Auth(store).setPassword('senha-apenas-de-teste');
  const server = await new Promise<Server>(resolve => { const server = createServer().listen(0, '127.0.0.1', () => resolve(server)); });
  const address = server.address() as { port: number }; const url = `http://127.0.0.1:${address.port}`;
  server.on('request', createApp(store, { origins: [url], loginLimit: 3 }));
  cleanup.push(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const headers = { Host: `127.0.0.1:${address.port}`, Origin: url, 'X-Shopping-Request': '1', 'Content-Type': 'application/json' };
  async function login() { const response = await fetch(`${url}/api/login`, { method: 'POST', headers, body: JSON.stringify({ password: 'senha-apenas-de-teste' }) }); return response.headers.get('set-cookie')!; }
  return { store, url, headers, login };
}
afterEach(async () => { vi.restoreAllMocks(); for (const stop of cleanup.splice(0)) await stop(); });
describe('API HTTP', () => {
  it('protege dados, configura cookie, usa ETag e revoga sessão', async () => {
    const { url, headers, login } = await fixture();
    expect((await fetch(`${url}/api/state`, { headers })).status).toBe(401);
    const cookie = await login(); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Expires=');
    const auth = { ...headers, Cookie: cookie.split(';')[0] };
    const response = await fetch(`${url}/api/state`, { headers: auth }); expect(response.status).toBe(200); expect((await response.json()).products).toHaveLength(92);
    expect((await fetch(`${url}/api/state`, { headers: { ...auth, 'If-None-Match': response.headers.get('etag')! } })).status).toBe(304);
    await fetch(`${url}/api/logout`, { method: 'POST', headers: auth, body: '{}' });
    expect((await fetch(`${url}/api/state`, { headers: auth })).status).toBe(401);
  });
  it('bloqueia Host/Origin externos, formulários e expõe apenas erros seguros', async () => {
    const { url, headers, login } = await fixture(); const cookie = (await login()).split(';')[0];
    const hostStatus = await new Promise<number | undefined>(resolve => { const req = request(`${url}/api/state`, { headers: { Host: 'evil.example', Cookie: cookie } }, res => { res.resume(); resolve(res.statusCode); }); req.end(); });
    expect(hostStatus).toBe(403);
    expect((await fetch(`${url}/api/commands`, { method: 'POST', headers: { ...headers, Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${url}/api/commands`, { method: 'POST', headers: { Host: headers.Host, Cookie: cookie }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${url}/api/commands`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: '{}' })).status).toBe(422);
    expect((await fetch(`${url}/data/shopping.sqlite`, { headers })).status).toBe(404);
  });
  it('processa requisições simultâneas e repetições exatamente uma vez', async () => {
    const { store, url, headers, login } = await fixture(); const cookie = (await login()).split(';')[0]; const s = store.read();
    const action = { type: 'quickAdd', listId: s.lists[0].id, productId: s.products[0].id };
    const one = { operationId: randomUUID(), expectedRevision: 0, action }; const two = { ...one, operationId: randomUUID() };
    const post = (body: unknown) => fetch(`${url}/api/commands`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify(body) });
    const results = await Promise.all([post(one), post(two), post(one)]); expect(results.map(r => r.status)).toEqual([200, 200, 200]); expect(store.read().items[0].quantity).toBe(2);
  });
  it('limita tentativas de senha e não inicia sessão incorreta', async () => {
    const { url, headers } = await fixture();
    for (let i = 0; i < 3; i++) expect((await fetch(`${url}/api/login`, { method: 'POST', headers, body: '{"password":"wrong"}' })).status).toBe(401);
    expect((await fetch(`${url}/api/login`, { method: 'POST', headers, body: '{"password":"wrong"}' })).status).toBe(429);
  });
});

it('protege prévia por sessão e origem e rejeita URL externa sem salvar', async () => {
  const { store, url, headers, login } = await fixture(); const purchaseId = store.read().lists[0].id;
  store.execute({ operationId: randomUUID(), expectedRevision: 0, action: { type: 'finishShopping', listId: purchaseId, policy: 'discard' } });
  const body = JSON.stringify({ purchaseId, url: 'http://127.0.0.1/private' });
  expect((await fetch(`${url}/api/receipts/preview`, { method: 'POST', headers, body })).status).toBe(401);
  const Cookie = (await login()).split(';')[0];
  expect((await fetch(`${url}/api/receipts/preview`, { method: 'POST', headers: { ...headers, Cookie, Origin: 'https://evil.test' }, body })).status).toBe(403);
  const response = await fetch(`${url}/api/receipts/preview`, { method: 'POST', headers: { ...headers, Cookie }, body });
  expect(response.status).toBe(422); expect((await response.json()).code).toBe('NFCE_ERROR'); expect(store.read().lists[0].receipt).toBeNull();
  expect(store.db.prepare('SELECT count(*) n FROM receipt_previews').get()).toEqual({ n: 0 });
});

it('consulta, confirma e lê NFC-e sem aceitar dados fiscais forjados do frontend', async () => {
  const { store, url, headers, login } = await fixture(); const purchaseId = store.read().lists[0].id;
  store.execute({ operationId: randomUUID(), expectedRevision: 0, action: { type: 'finishShopping', listId: purchaseId, policy: 'discard' } });
  const Cookie = (await login()).split(';')[0]; const auth = { ...headers, Cookie };
  const originalUrl = 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41250100000000000000650010000000011000000000|2|1|1|0000000000000000000000000000000000000000';
  const receipt = nfce.parseReceipt(readFileSync(new URL('./fixtures/nfce-pr.html', import.meta.url), 'utf8'), originalUrl);
  vi.spyOn(nfce, 'fetchReceipt').mockResolvedValue(receipt);
  const response = await fetch(`${url}/api/receipts/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ purchaseId, url: originalUrl }) }); expect(response.status).toBe(200);
  const preview = await response.json(); expect(store.read().lists[0].receipt).toBeNull();
  const post = (action: unknown) => fetch(`${url}/api/commands`, { method: 'POST', headers: auth, body: JSON.stringify({ operationId: randomUUID(), expectedRevision: store.read().revision, action }) });
  const action = { type: 'attachReceipt', purchaseId, previewToken: preview.token, confirmed: true };
  expect((await post({ ...action, receipt: { ...receipt, totalCents: 1 } })).status).toBe(422);
  expect((await post(action)).status).toBe(200); expect((await post(action)).status).toBe(409);
  const state = await (await fetch(`${url}/api/state`, { headers: auth })).json(); expect(state.lists[0].receipt).toEqual(receipt);
});

it('API impede nome duplicado inclusive arquivado e permite restaurar o mesmo ID', async () => {
  const { store, url, headers, login } = await fixture(); const Cookie = (await login()).split(';')[0];
  const post = (action: unknown) => fetch(`${url}/api/commands`, { method: 'POST', headers: { ...headers, Cookie }, body: JSON.stringify({ operationId: randomUUID(), expectedRevision: store.read().revision, action }) });
  const product = store.read().products[0];
  expect((await post({ type: 'archiveProduct', productId: product.id })).status).toBe(200);
  const duplicate = { name: '  ' + product.name.toUpperCase().replaceAll(' ', '   ') + ' ', categoryId: product.categoryId };
  const response = await post({ type: 'saveProduct', product: duplicate, addToListId: store.read().lists[0].id });
  expect(response.status).toBe(409); expect((await response.json()).code).toBe('DUPLICATE_PRODUCT');
  expect(store.read().items).toHaveLength(0);
  expect((await post({ type: 'saveProduct', product: { ...duplicate, id: store.read().products[1].id } })).status).toBe(409);
  expect((await post({ type: 'restoreAndAdd', productId: product.id, listId: store.read().lists[0].id })).status).toBe(200);
  expect(store.read().products[0].archivedAt).toBeNull(); expect(store.read().items[0].productId).toBe(product.id);
  expect((await post({ type: 'saveProduct', product: duplicate })).status).toBe(409);
});
