import { test, expect, login, snapshot } from './fixtures';

test('catálogo completo, seleção, carrinho, persistência e finalização', async ({ page, app }, testInfo) => {
  await login(page, app); await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
  await expect(page.locator('.product-card')).toHaveCount(92);
  await page.getByRole('checkbox', { name: 'Peito de frango', exact: false }).check();
  await page.getByRole('button', { name: 'Aumentar Peito de frango', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Amaciante', exact: false }).check();
  await page.getByRole('button', { name: 'Salvar seleção na lista' }).click();
  await expect(page.locator('.shopping-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Colocar no carrinho: Peito de frango', exact: true }).click();
  await page.reload(); await expect(page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('compra.png'), fullPage: true });
  await expect(page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('2');
  await page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Peito de frango');
  await page.locator('.quick-results button').click();
  await expect(page.getByRole('textbox', { name: 'Quantidade de Peito de frango', exact: true })).toHaveValue('3');
  await page.getByRole('button', { name: 'Colocar no carrinho: Peito de frango', exact: true }).click();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Manter os produtos pendentes' }).click();
  await expect(page.locator('.shopping-row')).toHaveCount(1); await expect(page.locator('.shopping-row')).toContainText('Amaciante');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('.history')).toHaveCount(1); await page.locator('summary').click(); await expect(page.locator('.history-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Minha compra' }).click(); await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Começar com uma lista vazia' }).click(); await expect(page.locator('.shopping-row')).toHaveCount(0); await page.getByRole('button', { name: 'Revisar catálogo completo' }).click(); await expect(page.locator('.product-card')).toHaveCount(92);
  await page.getByRole('button', { name: 'Voltar à lista' }).click(); await expect(page.locator('.shopping-row')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('gestão do catálogo persiste no servidor', async ({ page, app }) => {
  await login(page, app, true);
  await expect(page.locator('.shopping-row.in-cart')).toHaveCount(17);
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click(); await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await page.getByRole('textbox', { name: 'Nome do produto' }).fill('Produto de teste'); await page.getByRole('combobox', { name: 'Categoria' }).selectOption({ label: 'Limpeza/Higiene' });
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  const row = page.locator('.management-row').filter({ hasText: 'Produto de teste' });
  await row.getByRole('button', { name: 'Editar' }).click(); await page.getByRole('textbox', { name: 'Nome do produto' }).fill('Produto editado'); await page.getByRole('button', { name: 'Salvar produto' }).click();
  await page.locator('.management-row').filter({ hasText: 'Produto editado' }).getByRole('button', { name: 'Arquivar' }).click();
  await page.reload(); await page.getByRole('button', { name: 'Catálogo', exact: true }).click(); await page.getByRole('checkbox', { name: 'Mostrar arquivados' }).check();
  await expect(page.locator('.management-row').filter({ hasText: 'Produto editado' })).toContainText('Arquivado');
});

test('dados inválidos não são substituídos', async ({ page, app }) => {
  await page.addInitScript(() => localStorage.setItem('lista-compras-inteligente', '{corrompido'));
  await login(page, app); await expect(page.getByRole('heading', { name: 'Minha compra', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lista-compras-inteligente'))).toBe('{corrompido');
});
