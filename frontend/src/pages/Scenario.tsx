import { useState } from 'react';
import { delayScenario } from '../api';
import { fmtDate } from '../format';

export default function Scenario({ snapshot }: { snapshot: any }) {
  const expected = snapshot?.shipments_expected || [];
  const [shipId, setShipId] = useState('IN-AIR-01');
  const [newDate, setNewDate] = useState('2026-11-05T10:00');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function check(sid?: string, ndt?: string) {
    const id = sid || shipId;
    const local = ndt || newDate;
    setErr('');
    setBusy(true);
    try {
      const iso = local.includes('+') || local.endsWith('Z') ? local : `${local}:00+03:00`;
      const r = await delayScenario(id, iso);
      setRes(r);
    } catch (e: any) {
      setErr(e.message + (e.hint ? ' — ' + e.hint : ''));
    } finally {
      setBusy(false);
    }
  }

  function preset() {
    setShipId('IN-AIR-01');
    setNewDate('2026-11-05T10:00');
    check('IN-AIR-01', '2026-11-05T10:00');
  }

  const threatSet = new Set(res?.threatened || []);

  return (
    <div>
      <div className="card" style={{ borderColor: 'rgba(255,94,0,0.35)' }}>
        <div className="card-head-row">
          <div className="sp">
            <h3><span className="n">01</span> Параметры задержки</h3>
            <div className="muted">Пробный расчёт: склад не меняется, после перезагрузки цифры прежние. Пример: поставка air → 05.11.</div>
          </div>
          <span className="badge badge-blue">проба</span>
        </div>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <label>Поставка
            <select value={shipId} onChange={(e) => setShipId(e.target.value)}>
              {expected.map((s: any) => (
                <option key={s.shipment_id} value={s.shipment_id}>{(s.sku === 'FG-AIR' ? 'air' : 'air plus')} ×{s.quantity} · приедет {fmtDate(s.expected_at)} ({s.shipment_id})</option>
              ))}
            </select>
          </label>
          <label>Новая дата (Москва)
            <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          <button onClick={() => check()} disabled={busy}>{busy ? 'Считаем…' : 'Проверить ›'}</button>
          <button className="ghost" onClick={preset}>Пример: air → 05.11</button>
        </div>
        {err && <div className="error">{err}</div>}
        {!res && !err && (
          <div className="muted">Нажмите «Проверить» — покажем было / стало по каждому заказу и список угроз.</div>
        )}
      </div>

      {res && (
        <div className="two-col">
          <div className="card">
            <h3><span className="n">02</span> Было</h3>
            <div className="muted">Когда был готов до переноса.</div>
            <div className="tbl-wrap">
              <table className="tbl tbl-fit">
                <thead><tr><th>Заказ</th><th>будет готов</th><th></th></tr></thead>
                <tbody>
                  {res.before.map((b: any) => (
                    <tr key={b.order_id}>
                      <td className="mono">{b.order_id}</td>
                      <td className="mono">{b.readiness ? fmtDate(b.readiness) : '—'}</td>
                      <td>{b.atRisk ? <span className="badge badge-red">возможный риск</span> : <span className="badge badge-green">ок</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card" style={res.threatened.length ? { borderColor: 'rgba(240,135,140,0.4)' } : undefined}>
            <h3><span className="n">03</span> Стало</h3>
            <div className="muted">Когда будет готов после переноса.</div>
            <div className="tbl-wrap">
              <table className="tbl tbl-fit">
                <thead><tr><th>Заказ</th><th>будет готов</th><th></th></tr></thead>
                <tbody>
                  {res.after.map((a: any) => (
                    <tr key={a.order_id} className={threatSet.has(a.order_id) ? 'row-risk' : ''}>
                      <td><b>{a.order_id}</b>{threatSet.has(a.order_id) && <div className="sub" style={{ color: 'var(--danger)' }}>угроза задержки</div>}</td>
                      <td className="mono">{a.readiness ? fmtDate(a.readiness) : '—'}</td>
                      <td>{a.atRisk ? <span className="badge badge-red">возможный риск</span> : <span className="badge badge-green">ок</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {res && (
        <div className="card" style={{ borderColor: res.threatened.length ? 'rgba(240,135,140,0.35)' : 'rgba(127,214,164,0.3)' }}>
          <h3><span className="n">04</span> Итог · {res.threatened.length ? res.threatened.join(', ') : 'без угроз'}</h3>
          <div style={{ fontWeight: 300, color: 'var(--muted-fg)', fontSize: 14, lineHeight: 1.7 }}>{res.explanation}</div>
        </div>
      )}
    </div>
  );
}
