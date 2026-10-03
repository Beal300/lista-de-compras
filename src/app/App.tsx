import { SelectionControl } from '../components/SelectionControl';
import { useEffect, useRef, useState } from 'react';
import type { Product, Selection } from '../domain/models';
import { activeItems, activeList } from '../domain/shopping';
import type { Action } from '../domain/commands';
import { useSharedState } from './useSharedState';
import { LocalBackup } from '../components/LocalBackup';
import { Quantity } from '../components/Quantity';
import { ThemeControl } from '../components/ThemeControl';
import { PurchaseHistory } from '../components/PurchaseHistory';
import { normalizeProductName, sortProducts } from '../domain/products';
import { useCatalogOrder } from './useCatalogOrder';
import { parseMoney } from '../domain/money';

const searchKey = normalizeProductName;

export function App() {
  const shared = useSharedState();
  const catalogOrder = useCatalogOrder();
  const refocusQuick = useRef(false);
  const { state, loading, authenticated, connection, error, busy, uncertain } = shared;
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'shopping' | 'catalog' | 'history'>('shopping');
  const [search, setSearch] = useState('');
  const [review, setReview] = useState(false);
  const [selection, setSelection] = useState<Selection>({});
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const quickScroll = useRef(0);
  const quickRef = useRef<HTMLDialogElement>(null);
  const quickListId = useRef('');
  const returnToQuick = useRef(false);
  useEffect(() => {
    if (!quickOpen) return;
    const viewport = window.visualViewport;
    const fit = () => {
      quickRef.current?.style.setProperty('--quick-visible-height', (viewport?.height ?? window.innerHeight) + 'px');
      quickRef.current?.style.setProperty('--quick-visible-top', ((viewport?.offsetTop ?? 0) + 12) + 'px');
    };
    fit(); quickRef.current?.showModal(); quickRef.current?.querySelector('input')?.focus({ preventScroll: true });
    viewport?.addEventListener('resize', fit); viewport?.addEventListener('scroll', fit); window.addEventListener('resize', fit);
    return () => {
      viewport?.removeEventListener('resize', fit); viewport?.removeEventListener('scroll', fit); window.removeEventListener('resize', fit);
      requestAnimationFrame(() => window.scrollTo({ top: quickScroll.current, behavior: 'instant' }));
    };
  }, [quickOpen]);
  const toggleCategory = (id: string) => setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const [finish, setFinish] = useState(false);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  useEffect(() => {
    if (refocusQuick.current && !busy && !editing) {
      refocusQuick.current = false;
      document.getElementById(quickOpen ? 'quick-mobile' : 'quick')?.focus({ preventScroll: true });
    }
  }, [busy, editing, quickOpen, quickSearch]);
  function clearQuick() { setQuickSearch(''); refocusQuick.current = true; }
  const reviewBase = useRef({ revision: 0, listId: '' });
  const editorRevision = useRef(0);
  const finishBase = useRef({ revision: 0, listId: '' });
  const finishRef = useRef<HTMLDialogElement>(null);
  const editorRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (finish && authenticated) finishRef.current?.showModal(); }, [finish, authenticated]);
  useEffect(() => { if (editing && authenticated) editorRef.current?.showModal(); }, [editing, authenticated]);
  async function act(action: Action, message = '', revision = state?.revision) {
    const saved = await shared.send(action, revision);
    if (saved) setNotice(message);
    return saved;
  }
  async function retryPending() {
    const type = shared.pendingType;
    if (await shared.retry()) {
      if (type === 'saveProduct') { setEditing(null); if (quickCreate) { clearQuick(); if (returnToQuick.current) setQuickOpen(true); } setQuickCreate(false); }
      if (type === 'quickAdd' || type === 'restoreAndAdd') clearQuick();
      if (type === 'reviewSelection') { setReview(false); setSelection({}); }
      if (type === 'finishShopping') { setFinish(false); setQuickSearch(''); setReview(false); }
    }
  }
  function openReview() { if (!state) return; reviewBase.current = { revision: state.revision, listId: activeList(state).id }; setSelection(Object.fromEntries(activeItems(state).map(item => [item.productId, item.quantity]))); setSearch(''); setReview(true); setView('shopping'); }
  function openEditor(product: Product | 'new', fromQuick = false) { returnToQuick.current = fromQuick && quickOpen; setQuickCreate(fromQuick); quickListId.current = activeList(state!).id; editorRevision.current = state!.revision; setEditing(product); }
  function openFinish() { setAmount(''); setAmountError(''); finishBase.current = { revision: state!.revision, listId: activeList(state!).id }; setFinish(true); }
  function navigate(next: typeof view) { setView(next); setSearch(''); setReview(false); }
  const items = state ? activeItems(state) : [];
  const pending = items.filter(i => i.status === 'pending');
  const cart = items.filter(i => i.status === 'in_cart');
  const available = sortProducts(state?.products.filter(p => !p.archivedAt && !p.deletedAt) ?? [], catalogOrder.order);
  const archivedMatches = sortProducts(state?.products.filter(p => p.archivedAt && !p.deletedAt && searchKey(p.name).includes(searchKey(quickSearch))) ?? [], catalogOrder.order);
  const reviewProducts = state?.products.filter(p => (!p.archivedAt && !p.deletedAt) || items.some(item => item.productId === p.id)) ?? [];
  const productName = (id: string, fallback: string) => state?.products.find(p => p.id === id)?.name ?? fallback;
  const locked = busy || uncertain || connection !== 'Conectado';
  const saving = busy && !uncertain && connection === 'Conectado';
  const retryButton = uncertain && <button className="secondary" disabled={busy} onClick={() => void retryPending()}>Verificar operação pendente</button>;

  const renderQuick = (mobile: boolean) => (<section className="quick panel"><label htmlFor={mobile ? 'quick-mobile' : 'quick'}>Esqueceu alguma coisa?</label><p>Adição rápida: +1 unidade. Um item no carrinho volta para pendente.</p><span className="search-field"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id={mobile ? 'quick-mobile' : 'quick'} type="search" placeholder={mobile ? 'Nome do produto…' : 'Buscar produto para adicionar rapidamente…'} value={quickSearch} onChange={e => setQuickSearch(e.target.value)} /></span>{quickSearch && <div className="quick-results">{available.filter(p => searchKey(p.name).includes(searchKey(quickSearch))).map(p => <button key={p.id} onClick={async () => { if (await act({ type: 'quickAdd', listId: activeList(state!).id, productId: p.id }, `${p.name}: uma unidade adicionada.`)) clearQuick(); }}>{p.name}<span>+ 1</span></button>)}{archivedMatches.map(p => <button className="restore-result" key={p.id} onClick={async () => { if (await act({ type: 'restoreAndAdd', listId: activeList(state!).id, productId: p.id }, 'Produto restaurado e adicionado.')) clearQuick(); }}><span>{p.name}<small>Arquivado</small></span><span>Restaurar e adicionar</span></button>)}{!archivedMatches.length && !available.some(p => searchKey(p.name).includes(searchKey(quickSearch))) && <div><p>Nenhum produto encontrado.</p><button className="secondary" onClick={() => { setQuickOpen(false); openEditor('new', true); }}>Cadastrar “{quickSearch}” e adicionar</button></div>}</div>}</section>);
  async function complete(policy: 'carry_forward' | 'discard') {
    try { const amountCents = parseMoney(amount); setAmountError(''); if (await act({ type: 'finishShopping', listId: finishBase.current.listId, policy, amountCents }, 'Compra finalizada.', finishBase.current.revision)) { setFinish(false); setQuickSearch(''); setReview(false); setSelection({}); } }
    catch (e) { setAmountError((e as Error).message); }
  }
  const categoryControls = state && <div className="category-controls"><label className="sort-control">Ordenação dos produtos<select value={catalogOrder.order} onChange={e => catalogOrder.choose(e.target.value)}><option value="created">Ordem de cadastro</option><option value="alphabetical">Ordem alfabética</option></select></label>{catalogOrder.error && <small role="status">{catalogOrder.error}</small>}<button className="text-button" onClick={() => setCollapsed(new Set())}>Expandir todas</button><button className="text-button" onClick={() => setCollapsed(new Set(state.categories.flatMap(c => [c.id, 'active-' + c.id, 'archived-' + c.id])))}>Recolher todas</button></div>;
  return <div className={`shell ${authenticated && view === 'shopping' && !review ? 'shopping-active' : ''}`}>
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('shopping'); }}><span className="brand-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><span>Lista inteligente<small>Menos esquecimentos, mais praticidade.</small></span></a><div className="header-controls"><span className={`local-badge ${connection === 'Conectado' ? 'connected' : ''}`} role="status">● {connection}</span><ThemeControl />{authenticated && <button className="text-button" onClick={() => void shared.logout()}>Sair</button>}</div></header>
    {error && <div className="alert" role="alert">{error}</div>}{retryButton}
    <div className="sr-only" role="status">{notice}</div>
    {loading ? <main><p>Conectando ao servidor…</p></main> : !authenticated || !state ? <main className="welcome">
      <span className="eyebrow">UMA LISTA PARA A CASA TODA</span><h1>Suas compras, compartilhadas.</h1>
      <p>Entre com a senha definida no computador servidor.</p>
      <form className="panel login-form" onSubmit={async e => { e.preventDefault(); await shared.login(password); setPassword(''); }}>
        <label htmlFor="shared-password">Senha compartilhada</label><input id="shared-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <button className="primary" disabled={busy}>Entrar</button>
      </form>
      <LocalBackup />
    </main> : <>
      <nav aria-label="Navegação principal">{([['shopping', 'Minha compra'], ['catalog', 'Catálogo'], ['history', 'Histórico']] as const).map(([key, label]) => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}{key === 'shopping' && <span className="count">{items.length}</span>}</button>)}</nav>
      <main>
        <fieldset className="shared-content" disabled={locked} data-saving={saving} aria-busy={busy}>
        {view === 'shopping' && !review && <>
          <div className="page-heading"><div><span className="eyebrow">UMA COISA A MENOS PARA LEMBRAR</span><h1>Minha compra</h1><p>Confira a lista e marque o que já está no carrinho.</p></div><button className="secondary review-action" onClick={openReview}>+ Revisar catálogo completo</button></div>
          <div className="stats"><div><strong>{pending.length}</strong><span>Pendentes</span></div><div><strong>{cart.length}</strong><span>No carrinho</span></div><div><strong>{items.reduce((sum, i) => sum + i.quantity, 0)}</strong><span>Unidades na lista</span></div><div className="progress-block"><span>{items.length ? Math.round(cart.length / items.length * 100) : 0}% da lista no carrinho</span><progress value={cart.length} max={items.length || 1} /></div></div>
          {renderQuick(false)}
          {!items.length && <section className="empty panel"><span className="empty-icon">✓</span><h2>Sua próxima compra começa aqui</h2><p>Percorra as categorias e escolha apenas o que precisa.</p><button className="primary" onClick={openReview}>Selecionar produtos do catálogo</button></section>}
          {([['pending', 'Ainda falta pegar', pending], ['in_cart', 'Já está no carrinho', cart]] as const).map(([status, title, rows]) => rows.length > 0 && <section className="item-section" key={status}><h2>{title} <span className="count">{rows.length}</span></h2><div className="item-list">{rows.map(item => {
            const name = productName(item.productId, item.productSnapshot.name);
            return <article key={item.id} className={`shopping-row ${status === 'in_cart' ? 'in-cart' : ''}`}><SelectionControl kind="button" tone="success" checked={status === 'in_cart'} label={`${status === 'pending' ? 'Colocar no carrinho' : 'Marcar pendente'}: ${name}`} onChange={() => act({ type: 'updateItem', listId: activeList(state).id, itemId: item.id, patch: { status: status === 'pending' ? 'in_cart' : 'pending' } })} /><div className="item-name"><strong>{name}</strong><small>{status === 'in_cart' ? 'No carrinho' : 'Pendente'} · {item.productSnapshot.unit}</small></div><Quantity value={item.quantity} label={name} onChange={quantity => act({ type: 'updateItem', listId: activeList(state).id, itemId: item.id, patch: { quantity } })} /><button className="icon-button danger" aria-label={`Remover ${name}`} onClick={() => act({ type: 'removeItem', listId: activeList(state).id, itemId: item.id })}>×</button></article>;
          })}</div></section>)}
          <div className="checkout shopping-actions" role="region" aria-label="Ações da compra"><div className="checkout-summary"><strong>{cart.length} de {items.length} produtos no carrinho</strong><small>{pending.length ? `${pending.length} pendentes para revisar na finalização` : 'Tudo pronto para sua próxima compra'}</small></div><div className="purchase-buttons"><button className="secondary mobile-quick" onClick={() => { quickScroll.current = window.scrollY; setQuickOpen(true); }}>+ Adição rápida</button><button className="primary" disabled={!items.length} onClick={openFinish}>Finalizar compra →</button></div></div>
        </>}
        {view === 'shopping' && review && <>
          <div className="page-heading"><div><span className="eyebrow">PLANEJE SUA COMPRA</span><h1>O que está faltando?</h1><p>Revise todo o catálogo. Selecione os produtos e ajuste as quantidades.</p></div><button className="text-button" onClick={() => setReview(false)}>Voltar à lista</button></div>
          {state.revision !== reviewBase.current.revision && <p className="alert">A lista foi atualizada em outro dispositivo. Sua seleção foi preservada, mas está desatualizada. Volte à lista e abra o catálogo novamente antes de salvar.</p>}<label className="search-label">Buscar no catálogo<input type="search" placeholder="Nome do produto…" value={search} onChange={e => setSearch(e.target.value)} /></label>
          {categoryControls}{state.categories.map(category => {
            const products = sortProducts(reviewProducts.filter(p => p.categoryId === category.id && searchKey(p.name).includes(searchKey(search))), catalogOrder.order);
            return products.length > 0 && <section className="catalog-section" key={category.id}><h2><button className="category-toggle" aria-expanded={!collapsed.has(category.id)} onClick={() => toggleCategory(category.id)}>{category.name} <span className="count">{state.products.filter(p => p.categoryId === category.id && selection[p.id] !== undefined).length} selecionados · {products.length} produtos</span></button></h2><div className="product-grid" hidden={collapsed.has(category.id)}>{products.map(p => { const existing = items.find(i => i.productId === p.id); const selected = selection[p.id] !== undefined; return <article className={`product-card ${selected ? 'selected' : ''}`} key={p.id}><label><SelectionControl checked={selected} onChange={checked => setSelection(current => { const next = { ...current }; if (checked) next[p.id] = existing?.quantity ?? 1; else delete next[p.id]; return next; })} /><span><strong>{p.name}</strong><small>{existing ? `Na lista: ${existing.quantity} · ${existing.status === 'in_cart' ? 'no carrinho' : 'pendente'}` : p.unit}</small></span></label>{selected && <Quantity value={selection[p.id]} label={p.name} onChange={quantity => setSelection(current => ({ ...current, [p.id]: quantity }))} />}</article>; })}</div></section>;
          })}
          {!reviewProducts.some(p => searchKey(p.name).includes(searchKey(search))) && <p className="empty">Nenhum produto encontrado.</p>}
          <div className="checkout"><div><strong>{Object.keys(selection).length} produtos selecionados</strong><small>Itens existentes mantêm seu estado de carrinho.</small></div><button className="primary" onClick={async () => { if (await act({ type: 'reviewSelection', listId: reviewBase.current.listId, selection }, 'Seleção salva na lista.', reviewBase.current.revision)) { setReview(false); setSelection({}); } }}>Salvar seleção na lista</button></div>
        </>}
        {view === 'catalog' && <>
          <div className="page-heading"><div><span className="eyebrow">DO SEU JEITO</span><h1>Seu catálogo</h1><p>{available.length} produtos disponíveis, organizados para sua rotina.</p></div><button className="primary" onClick={() => openEditor('new')}>+ Cadastrar produto</button></div>
          <div className="catalog-tools"><label className="search-label">Buscar produtos<input type="search" placeholder="Nome do produto…" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Mostrar arquivados</label></div>
          {categoryControls}{(['active', 'archived'] as const).map(group => (group === 'active' || showArchived) && <section key={group} aria-label={group === 'active' ? 'Produtos ativos' : 'Produtos arquivados'}><h2>{group === 'active' ? 'Produtos ativos' : 'Produtos arquivados'}</h2>{state.categories.map(c => { const products = sortProducts(state.products.filter(p => !p.deletedAt && p.categoryId === c.id && (group === 'archived' ? !!p.archivedAt : !p.archivedAt) && searchKey(p.name).includes(searchKey(search))), catalogOrder.order); const key = group + '-' + c.id; return products.length > 0 && <section className="catalog-section" key={c.id}><h2><button className="category-toggle" aria-expanded={!collapsed.has(key)} onClick={() => toggleCategory(key)}>{c.name} <span className="count">{state.products.filter(p => p.categoryId === c.id && items.some(i => i.productId === p.id)).length} selecionados · {products.length} produtos</span></button></h2><div className="panel" hidden={collapsed.has(key)}>{products.map(p => <article className={`management-row ${p.archivedAt ? "archived" : ""}`} key={p.id}><div><strong>{p.name}</strong><small>{p.archivedAt ? 'Arquivado' : 'Disponível'} · {p.unit}</small></div><div className="row-actions"><button className="text-button" onClick={() => openEditor(p)}>Editar</button><button className="text-button" onClick={() => act({ type: 'archiveProduct', productId: p.id })}>{p.archivedAt ? 'Restaurar' : 'Arquivar'}</button></div></article>)}</div></section>; })}</section>)}

        </>}
        {view === 'history' && <>
          <div className="page-heading"><div><span className="eyebrow">SUAS COMPRAS ANTERIORES</span><h1>Histórico</h1><p>O registro de cada compra, com os produtos e quantidades daquele momento.</p></div></div>
          {!state.lists.some(l => l.status === 'completed') && <div className="empty panel"><h2>A primeira compra ainda está por vir</h2><p>As compras finalizadas aparecerão aqui.</p></div>}
          <PurchaseHistory state={state} act={act} locked={locked} />
        </>}
        </fieldset>
        <LocalBackup />
      </main>
      {quickOpen && <dialog className="quick-dialog" ref={quickRef} onCancel={() => setQuickOpen(false)} aria-label="Adição rápida">{error && <p role="alert" className="alert">{error}</p>}{retryButton}<fieldset className="shared-content" disabled={locked} data-saving={saving} aria-busy={busy}>{renderQuick(true)}</fieldset><button className="text-button" onClick={() => setQuickOpen(false)}>Voltar à compra</button></dialog>}
      {finish && <dialog ref={finishRef} onCancel={() => setFinish(false)} aria-labelledby="finish-title">{error && <p className="alert" role="alert">{error}</p>}{retryButton}<h2 id="finish-title">Finalizar esta compra?</h2><p>{pending.length ? cart.length + ' produtos no carrinho e ' + pending.length + ' pendentes. A compra será salva no histórico.' : 'Todos os itens foram comprados. A compra será salva no histórico e a próxima lista será iniciada vazia.'}</p><label>Valor da compra (R$, opcional)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex.: 123,45" /></label>{amountError && <p className="alert" role="alert">{amountError}</p>}<div className="dialog-options">{pending.length > 0 && <button className="primary" disabled={locked} onClick={() => void complete('carry_forward')}>Manter os produtos pendentes</button>}<button className={pending.length ? 'secondary' : 'primary'} disabled={locked} onClick={() => void complete('discard')}>{pending.length ? 'Começar com uma lista vazia' : 'Confirmar finalização'}</button><button className="text-button" onClick={() => setFinish(false)}>Continuar comprando</button></div></dialog>}
      {editing && <dialog ref={editorRef} onCancel={() => setEditing(null)} aria-labelledby="edit-title">{error && <p className="alert" role="alert">{error}</p>}{retryButton}<h2 id="edit-title">{editing === 'new' ? 'Novo produto' : 'Editar produto'}</h2><form onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); if (await act({ type: 'saveProduct', product: { id: editing === 'new' ? undefined : editing.id, name: String(form.get('name')), categoryId: String(form.get('category')), unit: String(form.get('unit')) as Product['unit'] }, addToListId: quickCreate ? quickListId.current : undefined }, 'Produto salvo.', editorRevision.current)) { setEditing(null); if (quickCreate) { clearQuick(); if (returnToQuick.current) setQuickOpen(true); } } }}><label>Nome do produto<input name="name" required maxLength={160} defaultValue={editing === 'new' ? (quickCreate ? quickSearch : '') : editing.name} autoFocus /></label><label>Categoria<select name="category" defaultValue={editing === 'new' ? state.categories[0].id : editing.categoryId}>{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Unidade<select name="unit" defaultValue={editing === 'new' ? 'unid' : editing.unit}>{['unid', 'kg', 'g', 'l', 'ml', 'pct', 'cx'].map(unit => <option key={unit}>{unit}</option>)}</select></label><p className="fineprint">Alterações no catálogo preservam o histórico das compras.</p><div className="dialog-options"><button className="primary" type="submit" disabled={locked}>Salvar produto</button><button className="text-button" type="button" onClick={() => setEditing(null)}>Cancelar</button></div></form></dialog>}
    </>}
    <footer>Lista de Compras Inteligente <span>Um pouco de organização, todos os dias.</span></footer>
  </div>;
}
