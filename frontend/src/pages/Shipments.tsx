import { useState } from 'react';
import { createShipment, receive } from '../api';
import { fmtDate } from '../format';

export default function Shipments({ snapshot, shipmentsAll, onChange }: { snapshot: any; shipmentsAll: any[]; onChange: () => void }) {
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ supplier: '', sku: 'FG-AIR', quantity: 10, expected_at: '2026-11-05T10:00' });
  const all = shipmentsAll.length ? shipmentsAll : (snapshot?.shipments_expected || []);
  const list = all.filter((s: any) => s.status === 'expected');
  const receivedCount = all.length - list.length;
  const now = snapshot?.now;

  async function doReceive(id: string) {
    setMsg('');
    try {
      await receive(id);
      setMsg(`Поставка ${id} принята — товар добавлен на склад, поставка убрана из списка.`);
      onChange();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    }
  }

  async function doCreate() {
    setMsg('');
    try {
      const expected_at = form.expected_at.includes('+') || form.expected_at.endsWith('Z') ? form.expected_at : `${form.expected_at}:00+03:00`;
      const r = await createShipment({ supplier: form.supplier || 'Новый поставщик', sku: form.sku, quantity: Number(form.quantity), expected_at });
      setShowNew(false);
      setMsg(`Поставка ${r.shipment_id} создана — появится в прогнозе готовности.`);
      onChange();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button onClick={() => setShowNew(true)}>+ Новая поставка</button>
        <span style={{ marginLeft: 'auto' }} className="badge badge-gray">
          {list.length} в пути{receivedCount > 0 ? ` · принято: ${receivedCount}` : ''}
        </span>
      </div>

      {msg && <div className="info">{msg}</div>}

      {showNew && (
        <div className="card" style={{ borderColor: 'rgba(255,94,0,0.4)' }}>
          <h3><span className="n">＋</span> Новая поставка</h3>
          <div className="muted">Дата — по Москве, позже текущего времени в программе. Номер присвоится сам.</div>
          <div className="form-grid">
            <label>Поставщик<input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Новый поставщик" /></label>
            <label>Товар
              <select value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}>
                <option value="FG-AIR">air — датчик температуры и влажности</option>
                <option value="FG-PLUS">air plus — датчик с CO₂</option>
              </select>
            </label>
            <label>Кол-во<input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
            <label>Приедет (Москва)<input type="datetime-local" value={form.expected_at} onChange={(e) => setForm({ ...form, expected_at: e.target.value })} /></label>
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
            <h3><span className="n">01</span> Поставки · {list.length}</h3>
            <div className="muted">Приёмка добавляет товар на склад один раз и убирает поставку из списка. Опоздавшая без приёмки — вне прогноза.</div>
          </div>
          <span className="badge badge-blue">в пути</span>
        </div>
        {list.length === 0 && <div className="muted">Все поставки приняты — список пуст.</div>}
        <div className="cx-rows">
          {list.map((s: any) => {
            const overdue = s.status === 'expected' && now && new Date(s.expected_at) < new Date(now);
            return (
              <div className={overdue ? 'cx-row risk' : 'cx-row'} key={s.shipment_id}>
                <span className={overdue ? 'cx-ic bad' : 'cx-ic cx-ic--accent'}>
                  <svg viewBox="0 0 50 30" fill="currentColor" aria-hidden="true"><path d="M10 19.96h10v-9.92h10v10H20v9.92H10v-9.92H0v-10h10zm40 .08H40v9.92h-9.999v-10H40v-9.92h10zM20 10H10V0h10zM40 0v10h-9.999V0z" /></svg>
                </span>
                <div className="cx-row-main">
                  <b>{s.shipment_id}</b>
                  <span>{s.supplier || 'поставщик'} · {s.sku === 'FG-AIR' ? 'air' : 'air plus'} × {s.quantity} · приедет {fmtDate(s.expected_at)}{overdue ? ' · опаздывает — вне прогноза' : ''}</span>
                </div>
                <div className="cx-row-meta">
                  <span className={overdue ? 'badge badge-red' : 'badge badge-blue'}>{overdue ? 'опаздывает' : 'в пути'}</span>
                  <button className="ghost small" onClick={() => doReceive(s.shipment_id)}>Принять ›</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
