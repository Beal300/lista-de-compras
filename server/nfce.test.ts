import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchReceipt, parseReceipt, validateReceiptUrl } from './nfce';
const url = 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41250100000000000000650010000000011000000000|2|1|1|0000000000000000000000000000000000000000';
const html = readFileSync(new URL('./fixtures/nfce-pr.html', import.meta.url), 'utf8');
const mock = (response: Response) => (async () => response) as typeof fetch;
describe('NFC-e PR (fixture sintética)', () => {
  it('interpreta todos os itens, totais e metadados sem perder decimais', () => {
    const r = parseReceipt(html, url); expect(r.items).toHaveLength(23); expect(r.totalCents).toBe(22765);
    expect(r.number).toBe('1'); expect(r.series).toBe('1'); expect(r.issuedAt).toBe('01/01/2025 12:00:00'); expect(r.cnpj).toBe('00000000000000');
    expect(r.items[2]).toMatchObject({ description: 'Tomate fictício Kg', quantity: '0.75', unit: 'Kg', unitPrice: '10.2', totalCents: 765, productId: null });
  });
  it('consulta HTML no backend', async () => { expect((await fetchReceipt(url, mock(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))).items).toHaveLength(23); });
  it('rejeita HTML inválido, incompleto e chave divergente', () => {
    for (const body of ['<html>Captcha</html>', html.replace('class="Rqtd"', 'class="changed"'), html.replace('>227,65<', '>valor inválido<'), html.replace('>23<', '>24<')]) expect(() => parseReceipt(body, url)).toThrow();
    expect(() => parseReceipt(html, url.replace('412501', '412502'))).toThrow();
  });
  it('trata falha de rede e indisponibilidade', async () => {
    await expect(fetchReceipt(url, (async () => { throw new Error('network'); }) as typeof fetch)).rejects.toThrow('rede');
    await expect(fetchReceipt(url, mock(new Response('', { status: 503 })))).rejects.toThrow('não respondeu');
  });
  it('bloqueia hosts, portas, credenciais, protocolos e caminhos arbitrários', () => {
    for (const input of ['http://127.0.0.1/', 'https://evil.test/nfce/qrcode?p=123', url.replace('www.fazenda.pr.gov.br', 'www.fazenda.pr.gov.br.evil.test'), url.replace('https://', 'https://user@'), url.replace('/nfce/', ':8443/nfce/'), url.replace('/nfce/qrcode', '/admin')]) expect(() => validateReceiptUrl(input)).toThrow();
  });
  it('valida cada redirecionamento e limita resposta', async () => {
    await expect(fetchReceipt(url, mock(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } })))).rejects.toThrow('não permitido');
    await expect(fetchReceipt(url, mock(new Response('a'.repeat(2097153), { headers: { 'content-type': 'text/html' } })))).rejects.toThrow('limite');
  });
});
