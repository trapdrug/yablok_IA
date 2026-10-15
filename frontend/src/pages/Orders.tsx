import { useState } from 'react';
import { createOrder, reserve, ship, orders as fetchOrders } from '../api';
import { fmtDate } from '../format';
import { RiskBadge, StatusBadge } from '../components/Badges';

export default function Orders({ snapshot, onChange }: { snapshot: any; onChange: () => void }) {
  const [skuFilter, setSkuFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [closed, setClosed] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ customer: '', sku: 'FG-AIR', quantity: 5, due_at: '2026-11-03T17:00' });
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const freeBySku: Record<string, number> = {};
  for (const s of snapshot?.stock || []) freeBySku[s.sku] = s.free ?? 0;

  function suggested(o: any) {
    return Math.max(0, Math.min(o.unreserved ?? 0, freeBySku[o.sku] ?? 0));
  }

  function qtyFor(o: any) {
    const v = qtyMap[o.order_id];
    if (v && v > 0) return Math.floor(v);
    return suggested(o);
  }

  if (!snapshot) return <div className="card">Загрузка…</div>;
  let list: any[] = snapshot.orders_active || [];
  if (skuFilter !== 'all') list = list.filter((o) => o.sku === skuFilter);
  if (riskFilter === 'risk') list = list.filter((o) => o.atRisk);
  if (riskFilter === 'ok') list = list.filter((o) => !o.atRisk);
  if (riskFilter === 'short') list = list.filter((o) => (o.shortage || 0) > 0);

  async function loadClosed() {
    try {
      const all = await fetchOrders('all');
      setClosed(all.filter((o: any) => o.status !== 'active'));
    } catch (e: any) {
      setMsg('Не удалось загрузить закрытые: ' + e.message);
    }
  }

  async function doReserve(o: any) {
    const qty = qtyFor(o);
    if (!(qty > 0)) {
      setMsg(`Нечего бронировать для ${o.order_id}: нет свободного запаса или всё уже в брони.`);
      return;
    }
    setMsg('');
    try {
      await reserve(o.order_id, qty);
      setMsg(`Забронировано ${qty} для ${o.order_id}.`);
      onChange();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    }
  }

  async function doShip(o: any) {
    const qty = qtyFor(o);
    if (!(qty > 0)) {
      setMsg(`Нечего отгружать для ${o.order_id}: нет брони.`);
      return;
    }
    setMsg('');
    try {
      await ship(o.order_id, qty);
      setMsg(`Отгружено ${qty} для ${o.order_id}.`);
      onChange();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    }
  }

  async function doCreate() {
    setMsg('');
    try {
      const due_at = form.due_at.includes('+') || form.due_at.endsWith('Z') ? form.due_at : `${form.due_at}:00+03:00`;
      await createOrder({ customer: form.customer || 'Новый клиент', sku: form.sku, quantity: Number(form.quantity), due_at });
      setShowNew(false);
      setMsg('Заказ создан — дата готовности пересчитана.');
      onChange();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <label>Товар
          <select value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)}>
            <option value="all">все</option>
            <option value="FG-AIR">air</option>
            <option value="FG-PLUS">air plus</option>
          </select>
        </label>
        <label>Состояние
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
            <option value="all">все</option>
            <option value="risk">в риске</option>
            <option value="ok">в срок</option>
            <option value="short">с нехваткой</option>
          </select>
        </label>
        <button onClick={() => setShowNew(true)}>+ Новый заказ</button>
        <label className="muted">
          <input type="checkbox" checked={showClosed} onChange={(e) => { setShowClosed(e.target.checked); if (e.target.checked) loadClosed(); }} />
          показать закрытые
        </label>
        <span style={{ marginLeft: 'auto' }} className="badge badge-gray">открыто: {list.length}</span>
      </div>

      {msg && <div className="info">{msg}</div>}

      {showNew && (
        <div className="card" style={{ borderColor: 'rgba(255,94,0,0.4)' }}>
          <h3><span className="n">＋</span> Новый заказ</h3>
          <div className="muted">Укажите срок по Москве — дата готовности посчитается сама.</div>
          <div className="form-grid">
            <label>Клиент<input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Новый клиент" /></label>
            <label>Товар
              <select value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}>
                <option value="FG-AIR">air — датчик температуры и влажности</option>
                <option value="FG-PLUS">air plus — датчик с CO₂</option>
              </select>
            </label>
            <label>Количество<input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
            <label>Нужен к дате (Москва)<input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label>
          </div>
          <div className="toolbar">
            <button onClick={doCreate}>Создать ›</button>
            <button className="ghost" onClick={() => setShowNew(false)}>Отмена</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head-row">
          <div className="sp">
            <h3><span className="n">01</span> Открытые · {list.length}</h3>
            <div className="muted">Бронь — из свободного запаса. Отгрузка — только из брони.</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Заказ</th><th>Клиент</th><th>Товар</th><th>шт</th><th>бронь</th><th>будет готов</th><th>состояние</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((o: any) => (
                <tr key={o.order_id} className={o.atRisk ? 'row-risk' : ''}>
                  <td><b>{o.order_id}</b><div className="sub">отгружено {o.shipped_qty}</div></td>
                  <td>{o.customer}</td>
                  <td><span className="cx-tag">{o.sku}</span></td>
                  <td className="mono">{o.quantity}</td>
                  <td className="mono">{o.reserved_qty}</td>
                  <td>{o.readiness ? fmtDate(o.readiness) : <span className="badge badge-red">не хватает {o.shortage}</span>}</td>
                  <td><RiskBadge atRisk={o.atRisk} shortage={o.shortage} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="number"
                      min={1}
                      style={{ width: 64 }}
                      title={`Количество (свободно по заказу: ${o.unreserved})`}
                      value={qtyMap[o.order_id] ?? ''}
                      placeholder={String(suggested(o))}
                      onChange={(e) => setQtyMap({ ...qtyMap, [o.order_id]: Number(e.target.value) })}
                    />{' '}
                    <button className="ghost small" disabled={o.unreserved <= 0} title={o.unreserved <= 0 ? 'Всё уже в брони' : `Забронировать ${qtyFor(o)}`} onClick={() => doReserve(o)}>Резерв</button>{' '}
                    <button className="ghost small" disabled={o.reserved_qty <= 0} title={o.reserved_qty <= 0 ? 'Нет брони для отгрузки' : `Отгрузить ${qtyFor(o)}`} onClick={() => doShip(o)}>Отгрузить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showClosed && (
        <div className="card">
          <h3><span className="n">02</span> Закрытые</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Номер</th><th>Клиент</th><th>Товар</th><th>шт</th><th>состояние</th></tr></thead>
              <tbody>
                {closed.map((o: any) => (
                  <tr key={o.order_id} className="row-closed">
                    <td className="mono">{o.order_id}</td><td>{o.customer}</td><td>{o.sku}</td><td>{o.quantity}</td>
                    <td><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
