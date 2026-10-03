import { useState } from 'react';
import type { AppState, Receipt, ShoppingList } from '../domain/models';
import type { Action } from '../domain/commands';
import { formatMoney, moneyInput, parseMoney } from '../domain/money';
import { HistoryGroups } from './HistoryGroups';

type Send = (action: Action, message?: string, revision?: number) => Promise<boolean>;
export function PurchaseHistory({ state, act, locked }: { state: AppState; act: Send; locked: boolean }) {
  const purchases = state.lists.filter(l => l.status === 'completed').slice().reverse();
  return <>
    {purchases.length > 1 && <button className="text-button danger" onClick={() => { if (window.confirm('Excluir todas as compras antigas e suas notas, mantendo somente a mais recente? Esta ação não pode ser desfeita.')) void act({ type: 'pruneHistory', keepId: purchases[0].id, confirmed: true }); }}>Manter somente a compra mais recente</button>}
    {purchases.map(list => <Purchase key={list.id} list={list} state={state} act={act} locked={locked} />)}
  </>;
}
function Purchase({ list, state, act, locked }: { list: ShoppingList; state: AppState; act: Send; locked: boolean }) {
  const [amount, setAmount] = useState<string | null>(null); const [base, setBase] = useState(0);
  const [url, setUrl] = useState(''); const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<{ token: string; receipt: Receipt } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const rows = state.items.filter(i => i.listId === list.id);
  async function consult() {
    setLoading(true); setError(''); setPreview(null);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/receipts/preview', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Shopping-Request': '1' }, body: JSON.stringify({ purchaseId: list.id, url }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message ?? 'Não foi possível consultar a NFC-e. Tente novamente mais tarde.');
      setPreview(result); setBase(state.revision);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na consulta.'); }
    finally { clearTimeout(timer); setLoading(false); }
  }
  return <details className="panel history"><summary><strong>Compra de {new Date(list.completedAt!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</strong><span>{rows.filter(i => i.status === 'in_cart').length} no carrinho · {rows.filter(i => i.status === 'pending').length} pendentes</span>{list.amountCents !== null && <span>Valor da compra: {formatMoney(list.amountCents)}</span>}</summary>
    <p>{list.pendingPolicy === 'carry_forward' ? 'Pendentes transferidos para a lista seguinte.' : 'Próxima lista iniciada vazia.'}</p>
    <div className="history-actions"><button className="secondary" onClick={() => { setAmount(moneyInput(list.amountCents)); setBase(state.revision); }}>{list.amountCents === null ? 'Adicionar valor' : 'Editar valor'}</button><button className="text-button danger" onClick={() => { if (window.confirm('Excluir esta compra e sua NFC-e do histórico? Esta ação não pode ser desfeita.')) void act({ type: 'deleteHistory', purchaseId: list.id, confirmed: true }); }}>Excluir compra</button></div>
    {amount !== null && <form onSubmit={async e => { e.preventDefault(); setError(''); try { if (await act({ type: 'setPurchaseAmount', purchaseId: list.id, amountCents: parseMoney(amount) }, 'Valor salvo.', base)) setAmount(null); } catch (e) { setError((e as Error).message); } }}><label>Valor da compra (R$)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label><p>Opcional. Deixe vazio para remover o valor.</p><button className="primary">Salvar valor</button><button type="button" className="text-button" onClick={() => setAmount(null)}>Cancelar</button></form>}
    {error && <p role="alert" className="alert">{error}</p>}
    <h3>Produtos planejados</h3><HistoryGroups items={rows} />
    {!list.receipt && <button className="secondary" onClick={() => { setAdding(!adding); setPreview(null); }}>Adicionar NFC-e</button>}
    {adding && !list.receipt && <section className="receipt-preview"><label>Link de consulta da NFC-e<input type="url" value={url} onChange={e => { setUrl(e.target.value); setPreview(null); }} /></label><button className="secondary" disabled={loading || locked || !url} onClick={() => void consult()}>{loading ? 'Consultando…' : 'Consultar NFC-e'}</button>
      {preview && <><h3>Prévia da NFC-e</h3><p>{preview.receipt.merchant}<br />{preview.receipt.issuedAt ?? 'Data não disponível'}<br />{preview.receipt.items.length} itens · {formatMoney(preview.receipt.totalCents)}</p><p>Vincular à compra de {new Date(list.completedAt!).toLocaleString('pt-BR')}? O total da nota será o valor final da compra.</p>{list.amountCents !== null && list.amountCents !== preview.receipt.totalCents && <p className="alert">Valor atual: {formatMoney(list.amountCents)}. Total da NFC-e: {formatMoney(preview.receipt.totalCents)}. Diferença: {formatMoney(Math.abs(list.amountCents - preview.receipt.totalCents))}. A substituição exige sua confirmação.</p>}<button className="primary" onClick={async () => { const different = list.amountCents !== null && list.amountCents !== preview.receipt.totalCents; if (different && !window.confirm('Substituir o valor da compra de ' + formatMoney(list.amountCents!) + ' por ' + formatMoney(preview.receipt.totalCents) + ' da NFC-e? Diferença de ' + formatMoney(Math.abs(list.amountCents! - preview.receipt.totalCents)) + '.')) return; if (await act({ type: 'attachReceipt', purchaseId: list.id, previewToken: preview.token, confirmed: true, replaceAmountConfirmed: different ? true : undefined }, 'NFC-e vinculada.', base)) { setPreview(null); setAdding(false); } }}>Confirmar vínculo com esta compra</button></>}
      <button className="text-button" onClick={() => { setAdding(false); setPreview(null); }}>Cancelar importação</button></section>}
    {list.receipt && <details className="receipt-detail"><summary>Ver nota detalhada · {formatMoney(list.receipt.totalCents)}</summary><h3>{list.receipt.merchant}</h3><p>CNPJ: {list.receipt.cnpj ?? 'Não disponível'}<br />{list.receipt.issuedAt ?? 'Data não disponível'} · Número {list.receipt.number ?? '—'} · Série {list.receipt.series ?? '—'}</p><p className="receipt-key">Chave: {list.receipt.accessKey}</p><a href={list.receipt.originalUrl} target="_blank" rel="noreferrer">Consulta original na SEFA/PR</a><p>Total da nota: {formatMoney(list.receipt.totalCents)}</p><ul className="receipt-items">{list.receipt.items.map((item, index) => <li key={index}><strong>{item.description}</strong><span>{item.quantity.replace('.', ',')} {item.unit} × R$ {item.unitPrice.replace('.', ',')}</span><span>Total: {formatMoney(item.totalCents)}</span></li>)}</ul></details>}
  </details>;
}
