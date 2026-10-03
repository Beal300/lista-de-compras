import { load } from 'cheerio';
import { receiptSchema, type Receipt } from '../src/domain/models';

export class ReceiptError extends Error { readonly status = 422; readonly code = 'NFCE_ERROR'; }
const invalid = () => new ReceiptError('A página não contém uma NFC-e completa no formato SEFA/PR suportado. Confira o link ou tente novamente mais tarde.');
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
export function decimal(s: string): string {
  s = clean(s);
  if (!/^(\d+|\d{1,3}(\.\d{3})+)(,\d{1,10})?$/.test(s)) throw invalid();
  s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,10})?$/.test(s)) throw invalid();
  return s;
}
function cents(s: string) {
  const [whole, fraction = ''] = decimal(s).split('.');
  if (fraction.length > 2) throw invalid();
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 999999999999) throw invalid();
  return result;
}
export function validateReceiptUrl(input: string, redirect = false): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new ReceiptError('Link de NFC-e inválido.'); }
  const paths: Record<string, string[]> = {
    'www.fazenda.pr.gov.br': ['/nfce/qrcode'],
    'www.nfce.fazenda.pr.gov.br': ['/nfce/qrcode'],
    'www.dfews.fazenda.pr.gov.br': ['/dfews/nfce/qrcode', '/dfews/retornoConsulta.do'],
  };
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || input.length > 4096 || !paths[url.hostname]?.includes(url.pathname) || (!redirect && !/^\d{44}\|/.test(url.searchParams.get('p') ?? ''))) {
    throw new ReceiptError('Use um link HTTPS de consulta NFC-e da SEFA/PR. Endereço não permitido.');
  }
  return url;
}
export function parseReceipt(html: string, originalUrl: string): Receipt {
  const url = validateReceiptUrl(originalUrl); const $ = load(html);
  const text = clean($('#infos').text());
  const accessKey = $('.chave').text().replace(/\s/g, '');
  const merchant = clean($('#u20').text());
  const cnpjMatch = clean($('#conteudo').text()).match(/CNPJ:\s*([\d./-]+)/);
  const rows = $('#tabResult tr');
  const items = rows.toArray().map(row => {
    const cell = $(row);
    const value = (selector: string) => { const el = cell.find(selector).clone(); el.find('strong').remove(); return clean(el.text()); };
    return { description: value('.txtTit2'), quantity: decimal(value('.Rqtd')), unit: value('.RUN'), unitPrice: decimal(value('.RvlUnit')), totalCents: cents(value('.valor')), productId: null };
  });
  const countRow = $('#totalNota [id="linhaTotal"]').filter((_, el) => /Qtd\. total de itens/i.test($(el).find('label').text()));
  const totalRow = $('#totalNota [id="linhaTotal"]').filter((_, el) => /Valor a pagar R\$/i.test($(el).find('label').text()));
  if (accessKey !== url.searchParams.get('p')!.split('|')[0] || !merchant || !items.length || Number(clean(countRow.find('.totalNumb').text())) !== items.length || totalRow.length !== 1 || items.some(i => Number(i.quantity) <= 0) || /cancelada|cancelamento|denegada/i.test($('#avisos').text())) throw invalid();
  const result = receiptSchema.safeParse({ accessKey, merchant, cnpj: cnpjMatch?.[1].replace(/\D/g, '') ?? null,
    number: text.match(/Número:\s*(\d+)/)?.[1] ?? null, series: text.match(/Série:\s*(\d+)/)?.[1] ?? null,
    issuedAt: text.match(/Emissão:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/)?.[1] ?? null,
    totalCents: cents(clean(totalRow.find('.totalNumb').text())), originalUrl, importedAt: new Date().toISOString(), items });
  if (!result.success) throw invalid();
  return result.data;
}
export async function fetchReceipt(input: string, request: typeof fetch = fetch): Promise<Receipt> {
  let url = validateReceiptUrl(input); const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000); const limit = 2 * 1024 * 1024;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await request(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (!response.headers.get('location')) throw invalid();
        url = validateReceiptUrl(new URL(response.headers.get('location')!, url).href, true); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new ReceiptError('A SEFA/PR não respondeu à consulta. Tente novamente mais tarde.'); }
      if (!response.headers.get('content-type')?.includes('text/html') || Number(response.headers.get('content-length')) > limit || !response.body) { await response.body?.cancel(); throw invalid(); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new ReceiptError('Resposta da SEFA/PR excedeu o limite permitido.'); chunks.push(value); } }
      finally { await reader.cancel(); }
      const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
      return parseReceipt(new TextDecoder(charset).decode(Buffer.concat(chunks)), input);
    }
    throw new ReceiptError('A consulta redirecionou muitas vezes. Confira o link da NFC-e.');
  } catch (error) {
    if (error instanceof ReceiptError) throw error;
    throw new ReceiptError('Não foi possível consultar a SEFA/PR (rede ou tempo limite). Tente novamente.');
  } finally { clearTimeout(timer); }
}
