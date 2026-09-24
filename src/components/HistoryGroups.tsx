import type { ShoppingListItem } from '../domain/models';

export function HistoryGroups({ items }: { items: ShoppingListItem[] }) {
  return <div className="history-groups">
    {([
      ['in_cart', 'Produtos comprados', '✓'],
      ['pending', 'Produtos pendentes', '◷'],
    ] as const).map(([status, title, icon]) => {
      const rows = items.filter(item => item.status === status);
      return <section key={status} className={`history-group ${status}`} aria-label={title}>
        <h3><span aria-hidden="true">{icon}</span> {title} <span className="count">{rows.length}</span></h3>
        {rows.length === 0 ? <p className="history-empty">Nenhum produto neste grupo.</p> : rows.map(item =>
          <div className="history-row" key={item.id}>
            <span>{item.productSnapshot.name}<small>{item.productSnapshot.categoryName}</small></span>
            <span>{item.quantity} {item.productSnapshot.unit}</span>
          </div>)}
      </section>;
    })}
  </div>;
}
