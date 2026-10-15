const TABS = [
  { id: 'stock', label: 'Склад' },
  { id: 'orders', label: 'Заказы' },
  { id: 'shipments', label: 'Поставки' },
  { id: 'simulation', label: 'Симуляция' },
  { id: 'ai', label: 'ИИ' },
  { id: 'production', label: 'Производство' },
];

export function Tabs({ tab, onChange }: { tab: string; onChange: (t: string) => void }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={tab === t.id ? 'tab active' : 'tab'}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}