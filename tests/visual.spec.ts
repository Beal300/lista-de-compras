import { test, expect, login } from './fixtures';

test('estados visuais distinguem pendência, carrinho e seleção com alvos acessíveis', async ({ page, app }, info) => {
  await login(page, app, true);
  await page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true }).click();
  const pending = page.locator('.shopping-row').filter({ hasText: 'Peito de frango' });
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
    await expect(pending.getByText('Pendente · unid')).toBeVisible();
    const colors = await pending.evaluate(row => {
      const root = getComputedStyle(document.documentElement);
      return { label: getComputedStyle(row.querySelector('small')!).color, quantity: getComputedStyle(row.querySelector('input')!).color, warning: root.getPropertyValue('--warning').trim() };
    });
    expect(colors.label).not.toBe(colors.quantity);
    await expect(pending.locator('.quantity input')).toHaveCSS('color', theme === 'light' ? 'rgb(41, 38, 51)' : 'rgb(241, 238, 247)');
    await expect(page.locator('.in-cart .quantity input').first()).toHaveCSS('color', theme === 'light' ? 'rgb(35, 115, 77)' : 'rgb(120, 214, 163)');
    const sizes = await page.locator('.shopping-row button, .theme-toggle').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(r => ({ width: r.width, height: r.height })));
    expect(sizes.every(size => size.width >= 44 && size.height >= 44)).toBe(true);
    await page.screenshot({ path: info.outputPath(`compra-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
    const selected = page.locator('.product-card.selected').first();
    await expect(selected.getByRole('checkbox')).toBeChecked();
    await expect(selected).toHaveCSS('background-color', theme === 'light' ? 'rgb(239, 232, 250)' : 'rgb(41, 38, 51)');
    await page.screenshot({ path: info.outputPath(`selecao-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Voltar à lista' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('acabamento responsivo mantém grid, seleção compartilhada e barra móvel', async ({ page, app }, info) => {
  await login(page, app, true);
  for (const [width, columns] of [[320, 1], [390, 1], [699, 1], [700, 2], [768, 2], [1024, 2], [1099, 2], [1100, 3], [1440, 3]] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
      const grid = page.locator('.item-list').first();
      expect(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns);
      const cards = await grid.locator('.shopping-row').evaluateAll(nodes => nodes.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
      expect(cards.every(card => card.width >= 280 && card.height < 180)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width <= 760) {
        const bar = page.getByRole('region', { name: 'Ações da compra' });
        const buttons = await bar.locator('button').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().height));
        expect(buttons[0]).toBe(buttons[1]); expect(buttons[0]).toBeGreaterThanOrEqual(44);
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        const last = await page.locator('.shopping-row').last().boundingBox();
        const bounds = await bar.boundingBox(); expect(last!.y + last!.height).toBeLessThanOrEqual(bounds!.y);
      }
      await page.evaluate(() => scrollTo(0, 0));
    }
  }
  await page.setViewportSize({ width: info.project.name === 'mobile' ? 390 : 1440, height: 900 });
  const toggle = page.getByRole('button', { name: 'Marcar pendente: Peito de frango', exact: true });
  const markStyle = await toggle.locator('.selection-mark').evaluate(el => {
    const css = getComputedStyle(el); return { width: css.width, height: css.height, radius: css.borderRadius };
  });
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Colocar no carrinho: Peito de frango', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: info.outputPath('acabamento-compra.png') });
  await page.getByRole('button', { name: 'Revisar catálogo completo' }).click();
  const checkbox = page.getByRole('checkbox', { name: /Peito de frango/ });
  await expect(checkbox).toBeChecked();
  const mark = checkbox.locator('..').locator('.selection-mark');
  expect(await mark.evaluate(el => { const css = getComputedStyle(el); return { width: css.width, height: css.height, radius: css.borderRadius }; })).toEqual(markStyle);
  await expect(mark.locator('svg')).toBeVisible();
  await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).not.toBeChecked();
  await expect(mark.locator('svg')).toBeHidden();
  await page.keyboard.press('Space'); await expect(checkbox).toBeChecked();
  await page.screenshot({ path: info.outputPath('acabamento-catalogo.png') });
});
