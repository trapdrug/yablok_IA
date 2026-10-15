import { fmtDate } from '../format';

export default function Dashboard({ snapshot, shipmentsAll }: { snapshot: any; shipmentsAll: any[] }) {
  if (!snapshot) return <div className="card">Загрузка snapshot…</div>;
  const air = snapshot.stock.find((s: any) => s.sku === 'FG-AIR');
  const plus = snapshot.stock.find((s: any) => s.sku === 'FG-PLUS');
  const now = snapshot.now;
  const all = shipmentsAll.length ? shipmentsAll : snapshot.shipments_expected;
  const list = all.filter((s: any) => s.status === 'expected' || !s.status);

  return (
    <div>
      <div className="fc-stats">
        <div className="fc-stat">
          <div className="fc-stat-label">air · FG-AIR</div>
          <div className="fc-stat-value">{air?.on_hand ?? '—'}<small> шт</small></div>
          <div className="fc-stat-sub">свободно <b>{air?.free ?? '—'}</b> · в резерве <b>{air?.reserved ?? '—'}</b></div>
        </div>
        <div className="fc-stat">
          <div className="fc-stat-label">air plus · FG-PLUS</div>
          <div className="fc-stat-value">{plus?.on_hand ?? '—'}<small> шт</small></div>
          <div className="fc-stat-sub">свободно <b>{plus?.free ?? '—'}</b> · в резерве <b>{plus?.reserved ?? '—'}</b></div>
        </div>
        <div className="fc-stat good">
          <div className="fc-stat-label">Активные заказы</div>
          <div className="fc-stat-value">{snapshot.kpi?.active_orders ?? '—'}</div>
          <div className="fc-stat-sub">поставок в пути <b>{snapshot.kpi?.expected_shipments ?? '—'}</b></div>
        </div>
        <div className={snapshot.kpi?.at_risk > 0 ? 'fc-stat risk' : 'fc-stat good'}>
          <div className="fc-stat-label">Возможные риски</div>
          <div className="fc-stat-value">{snapshot.kpi?.at_risk ?? '—'}</div>
          <div className="fc-stat-sub">{snapshot.kpi?.at_risk > 0 ? 'смотрите проверку задержки' : 'все заказы в срок'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head-row">
          <div className="sp">
            <h3><span className="n">01</span> Остатки</h3>
            <div className="muted">Датчик air — температура и влажность, air plus — ещё и CO₂. Время учебное: {fmtDate(now)} МСК. Свободно = в наличии минус бронь.</div>
          </div>
          <span className="badge badge-blue">{snapshot.stock.length} поз.</span>
        </div>
        <div className="cx-rows">
          {snapshot.stock.map((s: any) => {
            const pct = s.on_hand > 0 ? Math.round((s.reserved / s.on_hand) * 100) : 0;
            const isAir = s.sku === 'FG-AIR';
            return (
              <div className="cx-row" key={s.sku}>
                <span className="cx-ic cx-ic--accent">
                  <svg viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="M18 10h4V6h-4zM18 18h4v-4h-4zM20 34h4v-4h-4zM14 18h4v-4h-4zM14 14h4v-4h-4zM22 18h4v-4h-4zM22 14h4v-4h-4zM10 18h4v-4h-4zM12 34h4v-4h-4zM8 34h4v-4H8zM16 34h4v-4h-4zM24 34h4v-4h-4zM10 24h4v-4h-4zM18 24h4v-4h-4zM26 24h4v-4h-4zM10 28h4v-4h-4zM18 28h4v-4h-4zM26 28h4v-4h-4zM26 18h4v-4h-4zM28 34h4v-4h-4z" /></svg>
                </span>
                <div className="cx-row-main">
                  <b>Датчик {isAir ? 'air' : 'air plus'} ({s.sku})</b>
                  <span>в наличии {s.on_hand} · бронь {s.reserved} · свободно {s.free} · {pct}% в брони</span>
                  <div style={{ marginTop: 8 }}><div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div></div>
                </div>
                <div className="cx-row-meta">
                  <span className="cx-tag">{s.free} своб.</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head-row">
          <div className="sp">
            <h3><span className="n">02</span> Поставки в пути</h3>
            <div className="muted">Опоздавшая без приёмки не учитывается в прогнозе.</div>
          </div>
          <span className="badge badge-gray">{list.length} в пути</span>
        </div>
        <div className="cx-rows">
          {list.map((s: any) => {
            const overdue = s.status === 'expected' && new Date(s.expected_at) < new Date(now);
            return (
              <div className={overdue ? 'cx-row risk' : 'cx-row'} key={s.shipment_id}>
                <span className={overdue ? 'cx-ic bad' : 'cx-ic'}>
                  <svg viewBox="0 0 50 30" fill="currentColor" aria-hidden="true"><path d="M10 19.96h10v-9.92h10v10H20v9.92H10v-9.92H0v-10h10zm40 .08H40v9.92h-9.999v-10H40v-9.92h10zM20 10H10V0h10zM40 0v10h-9.999V0z" /></svg>
                </span>
                <div className="cx-row-main">
                  <b>{s.shipment_id}</b>
                  <span>{s.sku === 'FG-AIR' ? 'air' : 'air plus'} × {s.quantity} · приедет {fmtDate(s.expected_at)}{overdue ? ' · опаздывает — вне прогноза' : ''}</span>
                </div>
                <div className="cx-row-meta">
                  <span className={overdue ? 'badge badge-red' : 'badge badge-blue'}>{overdue ? 'опаздывает' : 'в пути'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
