import { useEffect, useRef, useState } from 'react';
import type { AppState, Product, Selection } from '../domain/models';
import { activeItems, archiveProduct, finishShopping, initialize, quickAdd, removeItem, saveProduct, reviewSelection, updateItem } from '../domain/shopping';
import { LocalStorageRepository, STORAGE_KEY } from '../persistence/repository';
import { Quantity } from '../components/Quantity';
import { ThemeControl } from '../components/ThemeControl';
import { HistoryGroups } from '../components/HistoryGroups';
import { actionErrorMessage } from './errors';

const searchKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const formatDate = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function App() {
  const repo = useRef<LocalStorageRepository | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'shopping' | 'catalog' | 'history'>('shopping');
  const [search, setSearch] = useState('');
  const [review, setReview] = useState(false);
  const [selection, setSelection] = useState<Selection>({});
  const [finish, setFinish] = useState(false);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const finishRef = useRef<HTMLDialogElement>(null);
  const editorRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try { const repository = new LocalStorageRepository(window.localStorage); repo.current = repository; setState(repository.load()); }
    catch { setBlocked(true); setError('Não foi possível ler os dados salvos. Eles foram preservados. Verifique o armazenamento do navegador ou restaure uma cópia antes de continuar.'); }
    setLoading(false);
    const changed = (e: StorageEvent) => { if (e.key === STORAGE_KEY || e.key === null) { setBlocked(true); setError('Os dados foram alterados em outra aba. Recarregue esta página para continuar com a versão atual.'); } };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => { if (finish) finishRef.current?.showModal(); }, [finish]);
  useEffect(() => { if (editing) editorRef.current?.showModal(); }, [editing]);
  function commit(next: AppState, message = '') {
    try { if (blocked) return false; repo.current!.save(next); setState(next); setError(''); setNotice(message); return true; }
    catch (e) { setError(`Não foi possível salvar a alteração. ${e instanceof Error ? e.message : 'Verifique o espaço disponível no navegador.'}`); return false; }
  }
  function act(action: () => AppState, message = '') {
    try { return commit(action(), message); } catch (error) { console.error('Falha na operação da lista de compras:', error); setError(actionErrorMessage(error)); return false; }
  }
  function openReview() { setSelection(Object.fromEntries((state ? activeItems(state) : []).map(item => [item.productId, item.quantity]))); setSearch(''); setReview(true); setView('shopping'); }
  function navigate(next: typeof view) { setView(next); setSearch(''); setReview(false); }
  const items = state ? activeItems(state) : [];
  const pending = items.filter(i => i.status === 'pending');
  const cart = items.filter(i => i.status === 'in_cart');
  const available = state?.products.filter(p => !p.archivedAt && !p.deletedAt) ?? [];
  const reviewProducts = state?.products.filter(p => (!p.archivedAt && !p.deletedAt) || items.some(item => item.productId === p.id)) ?? [];
  const productName = (id: string, fallback: string) => state?.products.find(p => p.id === id)?.name ?? fallback;

  return <div className="shell">
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('shopping'); }}><span className="brand-icon">✓</span><span>Lista inteligente<small>MENOS ESQUECIMENTOS. MAIS PRATICIDADE.</small></span></a><div className="header-controls"><span className="local-badge">● Neste navegador</span><ThemeControl /></div></header>
    {error && <div className="alert" role="alert">{error} {blocked && <button onClick={() => location.reload()}>Recarregar</button>}</div>}
    <div className="sr-only" role="status">{notice}</div>
    {loading ? <main><p>Carregando suas compras…</p></main> : blocked ? <main className="empty"><h1>Vamos preservar seus dados</h1><p>A gravação está bloqueada até que os dados possam ser carregados com segurança.</p></main> : !state ? <main className="welcome">
      <span className="eyebrow">SUA ROTINA, MAIS ORGANIZADA</span><h1>Uma boa compra<br />começa com uma lista.</h1><p>Seu catálogo já está preparado com 92 produtos em 3 categorias. Escolha como começar.</p>
      <div className="onboarding-options"><section className="panel"><span className="option-number">01</span><h2>Começar do meu jeito</h2><p>Importe o catálogo completo e selecione o que precisa em uma lista vazia.</p><button className="primary" onClick={() => { if (act(() => initialize(false))) openReview(); }}>Só catálogo · lista vazia</button></section><section className="panel"><span className="option-number">02</span><h2>Continuar da planilha</h2><p>Importe o catálogo e os 17 itens da compra, preservando quantidades e marcações de carrinho.</p><button className="secondary" onClick={() => act(() => initialize(true))}>Catálogo + lista da planilha</button></section></div><p className="fineprint">Seus dados ficam neste navegador, sem cadastro.</p>
    </main> : <>
      <nav aria-label="Navegação principal">{([['shopping', 'Minha compra'], ['catalog', 'Catálogo'], ['history', 'Histórico']] as const).map(([key, label]) => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}{key === 'shopping' && <span className="count">{items.length}</span>}</button>)}</nav>
      <main>
        {view === 'shopping' && !review && <>
          <div className="page-heading"><div><span className="eyebrow">UMA COISA A MENOS PARA LEMBRAR</span><h1>Minha compra</h1><p>Confira a lista e marque o que já está no carrinho.</p></div><button className="primary" onClick={openReview}>+ Revisar catálogo completo</button></div>
          <div className="stats"><div><strong>{pending.length}</strong><span>Pendentes</span></div><div><strong>{cart.length}</strong><span>No carrinho</span></div><div><strong>{items.reduce((sum, i) => sum + i.quantity, 0)}</strong><span>Unidades na lista</span></div><div className="progress-block"><span>{items.length ? Math.round(cart.length / items.length * 100) : 0}% da lista no carrinho</span><progress value={cart.length} max={items.length || 1} /></div></div>
          <section className="quick panel"><label htmlFor="quick">Esqueceu alguma coisa?</label><p>Adição rápida: +1 unidade. Um item no carrinho volta para pendente.</p><input id="quick" type="search" placeholder="Buscar produto para adicionar rapidamente…" value={quickSearch} onChange={e => setQuickSearch(e.target.value)} />{quickSearch && <div className="quick-results">{available.filter(p => searchKey(p.name).includes(searchKey(quickSearch))).map(p => <button key={p.id} onClick={() => act(() => quickAdd(state, p.id), `${p.name}: uma unidade adicionada.`)}>{p.name}<span>+ 1</span></button>)}{!available.some(p => searchKey(p.name).includes(searchKey(quickSearch))) && <p>Nenhum produto encontrado. Cadastre no catálogo.</p>}</div>}</section>
          {!items.length && <section className="empty panel"><span className="empty-icon">✓</span><h2>Sua próxima compra começa aqui</h2><p>Percorra as categorias e escolha apenas o que precisa.</p><button className="primary" onClick={openReview}>Selecionar produtos do catálogo</button></section>}
          {([['pending', 'Ainda falta pegar', pending], ['in_cart', 'Já está no carrinho', cart]] as const).map(([status, title, rows]) => rows.length > 0 && <section className="item-section" key={status}><h2>{title} <span className="count">{rows.length}</span></h2><div className="panel item-list">{rows.map(item => {
            const name = productName(item.productId, item.productSnapshot.name);
            return <article key={item.id} className={`shopping-row ${status === 'in_cart' ? 'in-cart' : ''}`}><button className="check" aria-pressed={status === 'in_cart'} aria-label={`${status === 'pending' ? 'Colocar no carrinho' : 'Marcar pendente'}: ${name}`} onClick={() => act(() => updateItem(state, item.id, { status: status === 'pending' ? 'in_cart' : 'pending' }))}>{status === 'in_cart' ? '✓' : ''}</button><div className="item-name"><strong>{name}</strong><small>{status === 'in_cart' ? 'No carrinho' : 'Pendente'} · {item.productSnapshot.unit}</small></div><Quantity value={item.quantity} label={name} onChange={quantity => act(() => updateItem(state, item.id, { quantity }))} /><button className="icon-button" aria-label={`Remover ${name}`} onClick={() => act(() => removeItem(state, item.id))}>×</button></article>;
          })}</div></section>)}
          <div className="checkout"><div><strong>{cart.length} de {items.length} produtos no carrinho</strong><small>{pending.length ? `${pending.length} pendentes para revisar na finalização` : 'Tudo pronto para sua próxima compra'}</small></div><button className="primary" disabled={!items.length} onClick={() => setFinish(true)}>Finalizar compra →</button></div>
        </>}
        {view === 'shopping' && review && <>
          <div className="page-heading"><div><span className="eyebrow">PLANEJE SUA COMPRA</span><h1>O que está faltando?</h1><p>Revise todo o catálogo. Selecione os produtos e ajuste as quantidades.</p></div><button className="secondary" onClick={() => setReview(false)}>Voltar à lista</button></div>
          <label className="search-label">Buscar no catálogo<input type="search" placeholder="Nome do produto…" value={search} onChange={e => setSearch(e.target.value)} /></label>
          {state.categories.map(category => {
            const products = reviewProducts.filter(p => p.categoryId === category.id && searchKey(p.name).includes(searchKey(search))).sort((a, b) => a.sortOrder - b.sortOrder);
            return products.length > 0 && <section className="catalog-section" key={category.id}><h2>{category.name} <span className="count">{products.length}</span></h2><div className="product-grid">{products.map(p => { const existing = items.find(i => i.productId === p.id); const selected = selection[p.id] !== undefined; return <article className={`product-card ${selected ? 'selected' : ''}`} key={p.id}><label><input type="checkbox" checked={selected} onChange={e => setSelection(current => { const next = { ...current }; if (e.target.checked) next[p.id] = existing?.quantity ?? 1; else delete next[p.id]; return next; })} /><span><strong>{p.name}</strong><small>{existing ? `Na lista: ${existing.quantity} · ${existing.status === 'in_cart' ? 'no carrinho' : 'pendente'}` : 'unid'}</small></span></label>{selected && <Quantity value={selection[p.id]} label={p.name} onChange={quantity => setSelection(current => ({ ...current, [p.id]: quantity }))} />}</article>; })}</div></section>;
          })}
          {!reviewProducts.some(p => searchKey(p.name).includes(searchKey(search))) && <p className="empty">Nenhum produto encontrado.</p>}
          <div className="checkout"><div><strong>{Object.keys(selection).length} produtos selecionados</strong><small>Itens existentes mantêm seu estado de carrinho.</small></div><button className="primary" onClick={() => { if (act(() => reviewSelection(state, selection), 'Seleção salva na lista.')) { setReview(false); setSelection({}); } }}>Salvar seleção na lista</button></div>
        </>}
        {view === 'catalog' && <>
          <div className="page-heading"><div><span className="eyebrow">DO SEU JEITO</span><h1>Seu catálogo</h1><p>{available.length} produtos disponíveis, organizados para sua rotina.</p></div><button className="primary" onClick={() => setEditing('new')}>+ Cadastrar produto</button></div>
          <div className="catalog-tools"><label className="search-label">Buscar produtos<input type="search" placeholder="Nome do produto…" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Mostrar arquivados</label></div>
          {state.categories.map(c => { const products = state.products.filter(p => p.categoryId === c.id && (showArchived || !p.archivedAt) && searchKey(p.name).includes(searchKey(search))); return products.length > 0 && <section className="catalog-section" key={c.id}><h2>{c.name} <span className="count">{products.length}</span></h2><div className="panel">{products.map(p => <article className="management-row" key={p.id}><div><strong>{p.name}</strong><small>{p.archivedAt ? 'Arquivado' : 'Disponível'} · {p.unit}</small></div><div className="row-actions"><button className="text-button" onClick={() => setEditing(p)}>Editar</button><button className="text-button" onClick={() => act(() => archiveProduct(state, p.id))}>{p.archivedAt ? 'Restaurar' : 'Arquivar'}</button></div></article>)}</div></section>; })}
        </>}
        {view === 'history' && <>
          <div className="page-heading"><div><span className="eyebrow">SUAS COMPRAS ANTERIORES</span><h1>Histórico</h1><p>O registro de cada compra, com os produtos e quantidades daquele momento.</p></div></div>
          {!state.lists.some(l => l.status === 'completed') && <div className="empty panel"><h2>A primeira compra ainda está por vir</h2><p>As compras finalizadas aparecerão aqui.</p></div>}
          {state.lists.filter(l => l.status === 'completed').slice().reverse().map(list => { const rows = state.items.filter(i => i.listId === list.id); return <details className="panel history" key={list.id}><summary><strong>Compra de {formatDate(list.completedAt!)}</strong><span>{rows.filter(i => i.status === 'in_cart').length} no carrinho · {rows.filter(i => i.status === 'pending').length} pendentes</span></summary><p>{list.pendingPolicy === 'carry_forward' ? 'Pendentes transferidos para a lista seguinte.' : 'Próxima lista iniciada vazia.'}</p><HistoryGroups items={rows} /></details>; })}
        </>}
      </main>
      {finish && <dialog ref={finishRef} onCancel={() => setFinish(false)} aria-labelledby="finish-title">{error && <p className="alert" role="alert">{error}</p>}<h2 id="finish-title">Finalizar esta compra?</h2><p>{cart.length} produtos no carrinho e {pending.length} pendentes. A compra será salva no histórico.</p><div className="dialog-options"><button className="primary" onClick={() => { if (act(() => finishShopping(state, 'carry_forward'), 'Compra finalizada. Pendentes mantidos.')) { setFinish(false); setQuickSearch(''); } }}>Manter os produtos pendentes</button><button className="secondary" onClick={() => { if (act(() => finishShopping(state, 'discard'), 'Compra finalizada. Nova lista vazia.')) { setFinish(false); setQuickSearch(''); openReview(); setSelection({}); } }}>Começar com uma lista vazia</button><button className="text-button" onClick={() => setFinish(false)}>Continuar comprando</button></div></dialog>}
      {editing && <dialog ref={editorRef} onCancel={() => setEditing(null)} aria-labelledby="edit-title">{error && <p className="alert" role="alert">{error}</p>}<h2 id="edit-title">{editing === 'new' ? 'Novo produto' : 'Editar produto'}</h2><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (act(() => saveProduct(state, { id: editing === 'new' ? undefined : editing.id, name: String(form.get('name')), categoryId: String(form.get('category')) }), 'Produto salvo.')) setEditing(null); }}><label>Nome do produto<input name="name" required maxLength={160} defaultValue={editing === 'new' ? '' : editing.name} autoFocus /></label><label>Categoria<select name="category" defaultValue={editing === 'new' ? state.categories[0].id : editing.categoryId}>{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p className="fineprint">Alterações no catálogo preservam o histórico das compras.</p><div className="dialog-options"><button className="primary" type="submit">Salvar produto</button><button className="text-button" type="button" onClick={() => setEditing(null)}>Cancelar</button></div></form></dialog>}
    </>}
    <footer>Lista de Compras Inteligente <span>Um pouco de organização, todos os dias.</span></footer>
  </div>;
}
