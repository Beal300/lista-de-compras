import { test, expect, login, snapshot } from './fixtures';

test('primeiro acesso e recarga preservam os dados, inclusive por HTTP de rede', async ({ page, app }) => {
  await login(page, app);
  if (process.env.TEST_NETWORK_HOST) {
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lista-compras-inteligente'))).toBeNull();
  const saved = await snapshot(page, app);
  expect(saved.products).toHaveLength(92); expect(saved.items).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minha compra', exact: true })).toBeVisible();
  expect(await snapshot(page, app)).toEqual(saved);
});

test('revisão espelha a lista, preserva carrinho e remove inclusive a última seleção', async ({ page, app }) => {
  await login(page, app, true);
  const saved = await snapshot(page, app);
  await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
  await expect(page.locator('.product-card input:checked')).toHaveCount(17);
  await expect(page.getByRole('checkbox', { name: 'Peito de frango' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('6');
  await expect(page.getByRole('checkbox', { name: 'Amaciante' })).not.toBeChecked();
  expect(await snapshot(page, app)).toEqual(saved);
  await page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true }).fill('7');
  await page.getByRole('checkbox', { name: 'Amaciante' }).check();
  await page.getByRole('checkbox', { name: 'Café', exact: false }).uncheck();
  await page.getByRole('searchbox', { name: 'Buscar no catálogo' }).fill('Amaciante');
  await page.getByRole('button', { name: 'Salvar seleção na lista' }).click();
  await expect(page.locator('.shopping-row')).toHaveCount(17);
  await expect(page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('7');
  await expect(page.getByRole('button', { name: 'Colocar no carrinho: Amaciante', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
  await expect(page.locator('.product-card input:checked')).toHaveCount(17);
  const checked = page.locator('.product-card input:checked');
  while (await checked.count()) await checked.first().uncheck();
  await page.getByRole('button', { name: 'Salvar seleção na lista' }).click();
  await expect(page.locator('.shopping-row')).toHaveCount(0);
});

test('aparência clara, escura e automática acompanha sistema e persiste sem alterar compras', async ({ page, app }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await login(page, app, true);
  const appearance = page.getByRole('combobox', { name: 'Aparência' });
  await expect(appearance).toHaveValue('auto'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const saved = await snapshot(page, app);
  await appearance.selectOption('light'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload(); await expect(appearance).toHaveValue('light'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await appearance.selectOption('dark'); await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload(); await expect(appearance).toHaveValue('dark'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('tema-escuro.png'), fullPage: true });
  await appearance.selectOption('auto'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload(); await expect(appearance).toHaveValue('auto'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await snapshot(page, app)).toEqual(saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('histórico existente é agrupado sem regravar ou alterar dados', async ({ page, app }, testInfo) => {
  await login(page, app, true);
  await page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true }).click();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Manter os produtos pendentes' }).click();
  await page.getByRole('combobox', { name: 'Aparência' }).selectOption('dark');
  const raw = await snapshot(page, app);
  await page.reload(); await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await page.locator('summary').click();
  const bought = page.getByRole('region', { name: 'Produtos comprados' });
  const pending = page.getByRole('region', { name: 'Produtos pendentes' });
  await expect(bought.locator('.history-row')).toHaveCount(16); await expect(bought.locator('.count')).toHaveText('16');
  await expect(pending.locator('.history-row')).toHaveCount(1); await expect(pending.locator('.count')).toHaveText('1');
  await expect(pending).toContainText('Peito de frango'); await expect(pending).toContainText('6 unid');
  expect(await snapshot(page, app)).toEqual(raw);
  await page.screenshot({ path: testInfo.outputPath('historico-escuro.png'), fullPage: true });
});
