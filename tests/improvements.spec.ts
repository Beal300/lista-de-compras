import { test, expect, login, snapshot } from './fixtures';
import { readFileSync } from 'node:fs';
import { parseReceipt } from '../server/nfce';
const url = 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41250100000000000000650010000000011000000000|2|1|1|0000000000000000000000000000000000000000';

test('compra sem pendentes, valor opcional editável e exclusão confirmada', async ({ page, app }) => {
  await login(page, app, true); await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.getByText('Todos os itens foram comprados.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manter os produtos pendentes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar finalização' }).click();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click(); await page.locator('.history > summary').click();
  expect((await snapshot(page, app)).lists[0].amountCents).toBeNull();
  await page.getByRole('button', { name: 'Adicionar valor', exact: true }).click(); await page.getByLabel('Valor da compra (R$)', { exact: true }).fill('123,45'); await page.getByRole('button', { name: 'Salvar valor' }).click();
  await expect(page.locator('.history > summary')).toContainText('123,45');
  await page.getByRole('button', { name: 'Editar valor' }).click(); await page.getByLabel('Valor da compra (R$)', { exact: true }).fill('150,00'); await page.getByRole('button', { name: 'Salvar valor' }).click();
  await expect(page.locator('.history > summary')).toContainText('150,00');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Excluir compra' }).click(); await expect(page.locator('.history')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Excluir compra' }).click(); await expect(page.locator('.history')).toHaveCount(0);
});

test('cadastro pela busca vazia e categorias recolhidas preservam seleção; arquivados separados', async ({ page, app }) => {
  await login(page, app); await page.getByRole('searchbox', { name: 'Esqueceu alguma coisa?' }).fill('Produto novo');
  await page.getByRole('button', { name: 'Cadastrar “Produto novo” e adicionar' }).click();
  await expect(page.getByLabel('Nome do produto')).toHaveValue('Produto novo'); await page.getByRole('combobox', { name: 'Unidade' }).selectOption('kg'); await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.locator('.shopping-row')).toContainText('Produto novo'); await expect(page.locator('.shopping-row')).toContainText('kg');
  await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
  const category = page.locator('.catalog-section').filter({ has: page.getByText('Produto novo', { exact: true }) });
  await category.locator('.category-toggle').click(); await expect(category.locator('.count')).toContainText('1 selecionados'); await expect(category.locator('.product-grid')).toBeHidden();
  await page.getByRole('button', { name: 'Expandir todas' }).click(); await expect(page.getByRole('checkbox', { name: 'Produto novo' })).toBeChecked();
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click(); await page.locator('.management-row').filter({ hasText: 'Produto novo' }).getByRole('button', { name: 'Arquivar' }).click();
  await page.getByLabel('Mostrar arquivados').check();
  await expect(page.getByRole('region', { name: 'Produtos arquivados', exact: true })).toContainText('Produto novo');
  await expect(page.getByRole('region', { name: 'Produtos ativos', exact: true })).not.toContainText('Produto novo');
});

test('adição rápida acessível após rolagem e estados do tema escuro', async ({ page, app }, info) => {
  await login(page, app, true); await page.getByRole('button', { name: 'Ativar tema escuro', exact: true }).click();
  await expect(page.locator('.connected')).toHaveCSS('color', 'rgb(120, 214, 163)');
  await expect(page.locator('.in-cart .check').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.quantity input').first()).toHaveCSS('color', 'rgb(120, 214, 163)');
  if (info.project.name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); const before = await page.evaluate(() => scrollY);
    await expect(page.getByRole('button', { name: '+ Adição rápida', exact: true })).toBeInViewport(); await page.getByRole('button', { name: '+ Adição rápida', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Adição rápida' }); await dialog.getByRole('searchbox').fill('Peito de frango'); await dialog.locator('.quick-results button').click(); await page.getByRole('button', { name: 'Voltar à compra' }).click();
    expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(100);
    expect((await snapshot(page, app)).items.find(i => i.productSnapshot.name === 'Peito de frango')?.status).toBe('pending');
  }
});

test('prévia da NFC-e exige confirmação e apresenta estabelecimento, data, itens e total', async ({ page, app }) => {
  await login(page, app, true); await page.getByRole('button', { name: 'Finalizar compra' }).click(); await page.getByLabel('Valor da compra (R$, opcional)').fill('227,65'); await page.getByRole('button', { name: 'Confirmar finalização' }).click();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click(); await page.locator('.history > summary').click();
  const receipt = parseReceipt(readFileSync('server/fixtures/nfce-pr.html', 'utf8'), url);
  await page.route('**/api/receipts/preview', route => route.fulfill({ json: { token: '11111111-1111-4111-8111-111111111111', receipt } }));
  await page.getByRole('button', { name: 'Adicionar NFC-e' }).click(); await page.getByLabel('Link de consulta da NFC-e').fill(url); await page.getByRole('button', { name: 'Consultar NFC-e' }).click();
  await expect(page.locator('.receipt-preview')).toContainText('MERCADO FICTÍCIO'); await expect(page.locator('.receipt-preview')).toContainText('23 itens'); await expect(page.locator('.receipt-preview')).toContainText('227,65');
  expect((await snapshot(page, app)).lists[0].receipt).toBeNull(); await expect(page.getByRole('button', { name: 'Confirmar vínculo com esta compra' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar importação' }).click(); expect((await snapshot(page, app)).lists[0].receipt).toBeNull();
  // A persisted API snapshot renders independently of the external consultation.
  const saved = await snapshot(page, app); saved.lists[0].receipt = receipt;
  await page.route('**/api/state', route => route.fulfill({ json: saved }));
  await page.reload(); await page.getByRole('button', { name: 'Histórico', exact: true }).click(); await page.locator('.history > summary').click();
  await page.getByText('Ver nota detalhada', { exact: false }).click();
  await expect(page.locator('.receipt-items li')).toHaveCount(23);
  await expect(page.locator('.receipt-items')).toContainText('Tomate fictício Kg'); await expect(page.locator('.receipt-items')).toContainText('0,75 Kg');
  await expect(page.locator('.history-groups')).not.toContainText('Produto fictício 23');
});
