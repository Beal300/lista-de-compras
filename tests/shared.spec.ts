import { test, expect, login, snapshot, command } from './fixtures';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('dois dispositivos somam adições, sincronizam catálogo e rejeitam quantidade desatualizada', async ({ page, browser, app }) => {
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } }); const phone = await other.newPage();
  try {
    await login(page, app); await login(phone, app);
    await page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Peito de frango');
    await phone.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Peito de frango');
    await Promise.all([page.locator('.quick-results button').click(), phone.locator('.quick-results button').click()]);
    await expect(page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('2', { timeout: 8000 });
    await expect(phone.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('2', { timeout: 8000 });
    const old = await snapshot(page, app); const item = old.items[0];
    await phone.getByRole('button', { name: 'Colocar no carrinho: Peito de frango', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true })).toBeVisible({ timeout: 8000 });
    const stale = await command(page.request, app, { type: 'updateItem', listId: item.listId, itemId: item.id, patch: { quantity: 8 } }, old.revision);
    expect(stale.status()).toBe(409); expect((await snapshot(page, app)).items[0]).toMatchObject({ quantity: 2, status: 'in_cart' });
    await page.getByRole('button', { name: 'Catálogo', exact: true }).click(); await phone.getByRole('button', { name: 'Catálogo', exact: true }).click();
    await phone.getByRole('button', { name: 'Cadastrar produto' }).click();
    await phone.getByRole('textbox', { name: 'Nome do produto' }).fill('Produto compartilhado');
    await phone.getByRole('button', { name: 'Salvar produto' }).click();
    await expect(page.locator('.management-row').filter({ hasText: 'Produto compartilhado' })).toBeVisible({ timeout: 8000 });
  } finally { await other.close(); }
});

test('revisão em andamento não é sobrescrita por sincronização e não apaga itens de outro aparelho', async ({ page, browser, app }) => {
  const other = await browser.newContext(); const phone = await other.newPage();
  try {
    await login(page, app); await login(phone, app);
    await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
    await page.getByRole('checkbox', { name: 'Peito de frango' }).check();
    await page.getByRole('button', { name: 'Aumentar Peito de frango', exact: true }).click();
    await phone.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Amaciante'); await phone.locator('.quick-results button').click();
    await expect(page.getByText('A lista foi atualizada em outro dispositivo.', { exact: false })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('checkbox', { name: 'Peito de frango' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Salvar seleção na lista' }).click();
    await expect(page.getByRole('alert')).toContainText('Outra pessoa alterou');
    expect((await snapshot(page, app)).items).toHaveLength(1);
    await page.getByRole('button', { name: 'Voltar à lista' }).click(); await expect(page.locator('.shopping-row')).toContainText('Amaciante');
  } finally { await other.close(); }
});

test('quantidade em digitação preserva a revisão de início e não sobrescreve incremento remoto', async ({ page, browser, app }) => {
  const other = await browser.newContext(); const phone = await other.newPage();
  try {
    await login(page, app); await login(phone, app);
    await page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Amaciante'); await page.locator('.quick-results button').click();
    const input = page.getByRole('textbox', { name: 'Quantidade de Amaciante', exact: true });
    await input.fill('9');
    await phone.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Amaciante'); await phone.locator('.quick-results button').click();
    await expect(phone.getByRole('textbox', { name: 'Quantidade de Amaciante', exact: true })).toHaveValue('2');
    await expect.poll(async () => page.locator('.stats').innerText()).toContain('2');
    await expect(input).toHaveValue('9'); await input.blur();
    await expect(page.getByRole('alert')).toContainText('Outra pessoa alterou');
    expect((await snapshot(page, app)).items[0].quantity).toBe(2);
  } finally { await other.close(); }
});

test('finalização é vista no outro aparelho e comandos da lista antiga não atingem a nova', async ({ page, browser, app }) => {
  const other = await browser.newContext(); const phone = await other.newPage();
  try {
    await login(page, app); await login(phone, app);
    await page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Amaciante'); await page.locator('.quick-results button').click();
    await expect(phone.locator('.shopping-row')).toHaveCount(1, { timeout: 8000 }); const old = await snapshot(phone, app);
    await page.getByRole('button', { name: 'Finalizar compra' }).click(); await page.getByRole('button', { name: 'Começar com uma lista vazia' }).click();
    await expect(page.locator('.shopping-row')).toHaveCount(0);
    const response = await command(phone.request, app, { type: 'quickAdd', listId: old.lists[0].id, productId: old.items[0].productId }, old.revision);
    expect(response.status()).toBe(409); expect((await response.json()).code).toBe('LIST_CHANGED');
    await expect(phone.locator('.shopping-row')).toHaveCount(0, { timeout: 8000 });
    await phone.getByRole('button', { name: 'Histórico', exact: true }).click(); await phone.locator('summary').click();
    await expect(phone.getByRole('region', { name: 'Produtos pendentes' })).toContainText('Amaciante');
    expect((await snapshot(page, app)).lists.filter(list => list.status === 'active')).toHaveLength(1);
  } finally { await other.close(); }
});

test('recupera conexão e preserva estado sem gravar no armazenamento local antigo', async ({ page, context, app }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('lista-compras-inteligente')) localStorage.setItem('lista-compras-inteligente', '{"backup":"anterior"}'); });
  await login(page, app);
  await context.setOffline(true);
  await expect(page.locator('.local-badge')).toHaveText(/Sem conexão|Reconectando/, { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Revisar catálogo completo' })).toBeDisabled();
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.local-badge')).toContainText('Conectado', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Revisar catálogo completo' })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('lista-compras-inteligente'))).toBe('{"backup":"anterior"}');
});

test('resposta perdida pode ser verificada novamente sem duplicar a adição', async ({ page, app }) => {
  await login(page, app);
  let loseOnce = true;
  await page.route('**/api/commands', async route => {
    if (loseOnce) { loseOnce = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Amaciante'); await page.locator('.quick-results button').click();
  await expect(page.getByRole('button', { name: 'Verificar operação pendente' })).toBeVisible();
  await page.getByRole('button', { name: 'Verificar operação pendente' }).click();
  await expect(page.getByRole('textbox', { name: 'Quantidade de Amaciante', exact: true })).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Verificar operação pendente' })).toHaveCount(0);
  expect((await snapshot(page, app)).revision).toBe(1);
});

test('resposta perdida no cadastro pode ser confirmada dentro do diálogo sem duplicar produto', async ({ page, app }) => {
  await login(page, app); await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await page.getByRole('textbox', { name: 'Nome do produto' }).fill('Produto com resposta perdida');
  let lose = true;
  await page.route('**/api/commands', async route => { if (lose) { lose = false; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Verificar operação pendente' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.management-row').filter({ hasText: 'Produto com resposta perdida' })).toHaveCount(1);
  expect((await snapshot(page, app)).products).toHaveLength(93);
});

test('cookie sobrevive à reabertura, dados privados exigem sessão e exportação local não altera a base', async ({ page, context, app }) => {
  await page.goto(app.origin); expect((await page.request.get(`${app.origin}/api/state`)).status()).toBe(401);
  await page.getByLabel('Senha compartilhada').fill('incorreta'); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Senha incorreta');
  await page.getByLabel('Senha compartilhada').fill(app.password); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha compra', exact: true })).toBeVisible();
  const reopened = await context.newPage(); await reopened.goto(app.origin);
  await expect(reopened.getByRole('heading', { name: 'Minha compra', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('lista-compras-inteligente', '{"dados":"antigos"}'));
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar dados locais antigos (JSON)' }).click();
  const path = await (await download).path(); expect(await readFile(path!, 'utf8')).toBe('{"dados":"antigos"}');
  expect((await snapshot(page, app)).items).toHaveLength(0);
  const id = randomUUID(); const state = await snapshot(page, app);
  const action = { type: 'quickAdd' as const, listId: state.lists[0].id, productId: state.products[0].id };
  await command(page.request, app, action, 0, id); await command(page.request, app, action, 0, id);
  expect((await snapshot(page, app)).items[0].quantity).toBe(1);
  await reopened.close();
});
