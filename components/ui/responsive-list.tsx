export function ResponsiveList<T>({ items, getKey, renderItem, empty }: { items: T[]; getKey: (item: T) => string; renderItem: (item: T) => React.ReactNode; empty: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  return <div className="space-y-3">{items.map((item) => <div key={getKey(item)}>{renderItem(item)}</div>)}</div>;
}
