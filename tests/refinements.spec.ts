import { test, expect, login, snapshot, command } from './fixtures';
import { parseReceipt } from '../server/nfce';
import { readFileSync } from 'node:fs';

const name = 'Peito de frango';
test('adição rápida limpa somente após sucesso e restaura o arquivado sem duplicar', async ({ page, app }) => {
  await login(page, app); const initial = await snapshot(page, app); const product = initial.products.find(p => p.name === name)!;
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await page.locator('.management-row').filter({ hasText: name }).getByRole('button', { name: 'Arquivar', exact: true }).click();
  await page.getByRole('button', { name: 'Minha compra' }).click(); const input = page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' });
  await input.fill('  PEITO  DE FRANGO  ');
  await expect(page.getByRole('button', { name: /Cadastrar.*adicionar/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Restaurar e adicionar/ }).click();
  await expect(input).toHaveValue(''); await expect(input).toBeFocused(); await expect(page.locator('.quick-results')).toHaveCount(0);
  const restored = await snapshot(page, app); expect(restored.products).toHaveLength(initial.products.length); expect(restored.items[0].productId).toBe(product.id); expect(restored.products.find(p => p.id === product.id)?.archivedAt).toBeNull();
  await input.fill(name);
  await page.route('**/api/commands', route => route.fulfill({ status: 422, json: { code: 'TEST_REJECTION', message: 'Não foi salvo.' } }), { times: 1 });
  await page.locator('.quick-results button').click(); await expect(page.getByRole('alert')).toContainText('Não foi salvo.'); await expect(input).toHaveValue(name);
  await page.locator('.quick-results button').click(); await expect(input).toHaveValue(''); await expect(page.getByRole('textbox', { name: 'Quantidade de ' + name, exact: true })).toHaveValue('2');
});

test('ordenação persiste, funciona nas categorias e não modifica o catálogo armazenado', async ({ page, app }) => {
  await login(page, app); const before = await snapshot(page, app);
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click(); const rows = page.locator('.catalog-section').first().locator('.management-row strong');
  const original = await rows.allTextContents();
  await page.getByRole('combobox', { name: 'Ordenação dos produtos' }).selectOption('alphabetical');
  await expect(rows).toHaveText([...original].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })));
  await page.reload(); await page.getByRole('button', { name: 'Catálogo', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Ordenação dos produtos' })).toHaveValue('alphabetical');
  await page.getByRole('button', { name: 'Minha compra' }).click(); await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
  await expect(page.locator('.catalog-section').first().locator('.product-card strong')).toHaveText([...original].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })));
  await page.getByRole('combobox', { name: 'Ordenação dos produtos' }).selectOption('created');
  await expect(page.locator('.catalog-section').first().locator('.product-card strong')).toHaveText(original);
  expect(await snapshot(page, app)).toEqual(before);
});

test('gravação e polling preservam DOM e opacidade dos controles não alterados', async ({ page, app }) => {
  await login(page, app, true);
  const main = await page.locator('main').elementHandle(); const unchanged = page.locator('.shopping-row').filter({ hasText: 'Linguiça de frango' }); const node = await unchanged.elementHandle();
  const button = unchanged.locator('.check'); await expect(button).toHaveCSS('opacity', '1');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/commands', async route => { await gate; await route.continue(); }, { times: 1 });
  await page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true }).click();
  await expect(page.locator('main > .shared-content')).toHaveAttribute('aria-busy', 'true'); await expect(button).toBeDisabled(); await expect(button).toHaveCSS('opacity', '1');
  expect(await main!.evaluate(el => el.isConnected)).toBe(true); expect(await node!.evaluate(el => el.isConnected)).toBe(true);
  release(); await expect(page.getByRole('button', { name: 'Colocar no carrinho: Peito de frango', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remover Peito de frango', exact: true }).click(); await expect(page.getByRole('button', { name: 'Remover Peito de frango', exact: true })).toHaveCount(0);
  const state = await snapshot(page, app); const item = state.items.find(i => i.productSnapshot.name.toLowerCase().includes('linguiça de frango'))!;
  expect((await command(page.request, app, { type: 'updateItem', listId: item.listId, itemId: item.id, patch: { quantity: 8 } }, state.revision)).ok()).toBe(true);
  await expect(unchanged.getByRole('textbox')).toHaveValue('8', { timeout: 8000 });
  expect(await main!.evaluate(el => el.isConnected)).toBe(true); expect(await node!.evaluate(el => el.isConnected)).toBe(true); await expect(button).toHaveCSS('opacity', '1');
});

test('ações móveis juntas, busca compacta e tema acessível por teclado', async ({ page, app }, info) => {
  await login(page, app, true); const dark = page.getByRole('button', { name: 'Ativar tema escuro', exact: true }); await dark.focus(); await page.keyboard.press('Enter'); await expect(page.locator('.theme-toggle')).toHaveAttribute('title', 'Ativar tema claro'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  if (info.project.name === 'mobile') {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 640 }); await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      const actions = page.getByRole('region', { name: 'Ações da compra' }); await expect(actions).toBeInViewport();
      const quick = actions.getByRole('button', { name: '+ Adição rápida', exact: true }); const finish = actions.getByRole('button', { name: 'Finalizar compra' });
      const q = (await quick.boundingBox())!; const f = (await finish.boundingBox())!; expect(Math.abs(q.y - f.y)).toBeLessThan(2); expect(f.x).toBeGreaterThan(q.x); expect(f.width).toBeGreaterThan(q.width);
      await quick.click(); const dialog = page.getByRole('dialog', { name: 'Adição rápida' }); const input = dialog.getByRole('searchbox'); await expect(input).toBeFocused();
      await page.setViewportSize({ width, height: 360 }); await input.fill(name); await dialog.locator('.quick-results button').click(); await expect(input).toHaveValue(''); await expect(input).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`busca-${width}.png`) }); await page.getByRole('button', { name: 'Voltar à compra' }).click();
    }
  }
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('refinamento.png'), fullPage: true });
});

test('NFC-e mostra diferença e só solicita substituição após confirmação', async ({ page, app }) => {
  await login(page, app, true); await page.getByRole('button', { name: 'Finalizar compra' }).click(); await page.getByLabel('Valor da compra (R$, opcional)').fill('100,00'); await page.getByRole('button', { name: 'Confirmar finalização' }).click();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click(); await page.locator('.history > summary').click();
  const originalUrl = 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41250100000000000000650010000000011000000000|2|1|1|0000000000000000000000000000000000000000';
  const receipt = parseReceipt(readFileSync('server/fixtures/nfce-pr.html', 'utf8'), originalUrl); const state = await snapshot(page, app);
  await page.route('**/api/receipts/preview', route => route.fulfill({ json: { token: '11111111-1111-4111-8111-111111111111', receipt } }));
  const actions: unknown[] = []; await page.route('**/api/commands', route => { actions.push(route.request().postDataJSON().action); state.lists[0].receipt = receipt; state.lists[0].amountCents = receipt.totalCents; state.revision++; return route.fulfill({ json: { state } }); });
  await page.getByRole('button', { name: 'Adicionar NFC-e' }).click(); await page.getByLabel('Link de consulta da NFC-e').fill(originalUrl); await page.getByRole('button', { name: 'Consultar NFC-e' }).click();
  await expect(page.locator('.receipt-preview .alert')).toContainText('127,65');
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('100,00'); expect(dialog.message()).toContain('227,65'); await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Confirmar vínculo com esta compra' }).click(); expect(actions).toHaveLength(0); await expect(page.locator('.history > summary')).toContainText('100,00');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Confirmar vínculo com esta compra' }).click(); await expect(page.locator('.history > summary')).toContainText('227,65');
  expect(actions).toHaveLength(1); expect(actions[0]).toMatchObject({ type: 'attachReceipt', replaceAmountConfirmed: true });
});

test('cadastro iniciado na busca móvel retorna ao campo limpo', async ({ page, app }, info) => {
  test.skip(info.project.name !== 'mobile', 'Fluxo exclusivo do diálogo móvel');
  await login(page, app); await page.getByRole('button', { name: '+ Adição rápida', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adição rápida' }); await dialog.getByRole('searchbox').fill('Produto inédito móvel');
  await dialog.getByRole('button', { name: /Cadastrar.*adicionar/ }).click();
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole('searchbox')).toHaveValue(''); await expect(dialog.getByRole('searchbox')).toBeFocused();
  const state = await snapshot(page, app); expect(state.items[0]).toMatchObject({ quantity: 1, productSnapshot: { name: 'Produto inédito móvel' } });
});
