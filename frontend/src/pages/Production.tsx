import { useEffect, useState } from 'react';
import { prodStatus, prodPlan, prodStart } from '../api';
import { fmtDate } from '../format';

export default function Production() {
  const [status, setStatus] = useState<any>(null);
  const [sku, setSku] = useState('FG-PLUS');
  const [qty, setQty] = useState(8);
  const [start, setStart] = useState('2026-11-02T09:00');
  const [plan, setPlan] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setStatus(await prodStatus()); }
    catch (e: any) { setMsg('Ошибка статуса: ' + e.message); }
  }
  useEffect(() => { load(); }, []);

  async function doPlan() {
    setMsg('');
    setBusy(true);
    try {
      const sf = start.includes('+') || start.endsWith('Z') ? start : `${start}:00+03:00`;
      const r = await prodPlan(sku, Number(qty), sf);
      setPlan(r);
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    } finally {
      setBusy(false);
    }
  }

  async function doStart() {
    setMsg('');
    try {
      const r = await prodStart(sku, Number(qty));
      setPlan(r);
      setMsg('Партия запущена, компоненты списаны со склада.');
      load();
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}${e.hint ? ' — ' + e.hint : ''}`);
    }
  }

  function Gantt({ timeline }: { timeline: any[] }) {
    if (!timeline?.length) return <div className="muted">Пока нет графика</div>;
    const t0 = new Date('2026-11-02T09:00:00+03:00').getTime();
    const t1 = new Date('2026-11-06T17:00:00+03:00').getTime();
    const span = t1 - t0;
    const left = (iso: string) => `${Math.max(0, ((new Date(iso).getTime() - t0) / span) * 100)}%`;
    const width = (a: string, b: string) => `${Math.max(0.5, ((new Date(b).getTime() - new Date(a).getTime()) / span) * 100)}%`;
    return (
      <div className="gantt">
        <div className="gantt-scale"><span>02.11 09:00</span><span>04.11</span><span>06.11 17:00</span></div>
        {timeline.slice(0, 30).map((u: any) => (
          <div key={u.unit} className="gantt-row">
            <span className="gantt-label">#{u.unit}</span>
            <div className="gantt-track">
              <div className="g-asm" title={`Сборка ${fmtDate(u.assembly_start)}–${fmtDate(u.assembly_end)}`} style={{ left: left(u.assembly_start), width: width(u.assembly_start, u.assembly_end) }} />
              <div className="g-tst" title={`Тест ${fmtDate(u.test_start)}–${fmtDate(u.test_end)}`} style={{ left: left(u.test_start), width: width(u.test_start, u.test_end) }} />
            </div>
          </div>
        ))}
        {timeline.length > 30 && <div className="muted">Показано 30 из {timeline.length}</div>}
        <div className="muted"><span className="legend-asm">■</span> сборка · <span className="legend-tst">■</span> проверка · работа после 17:00 → с 09:00 следующего дня</div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="card-head-row">
          <div className="sp">
            <h3><span className="n">01</span> Компоненты</h3>
            <div className="muted">Состав: корпус, плата, сенсоры, CO₂-модуль. Чего не хватает — подсветим.</div>
          </div>
          {status && <span className="badge badge-gray">{status.component_stock.length} позиций</span>}
        </div>
        {status ? (
          <>
            <div className="cx-rows">
              {status.component_stock.map((c: any) => {
                const low = c.on_hand === 0 || (c.sku === 'CMP-CO2' && c.on_hand < 8);
                return (
                  <div className={low ? 'cx-row risk' : 'cx-row'} key={c.sku}>
                    <span className={low ? 'cx-ic bad' : 'cx-ic good'}>
                      {c.sku.replace('CMP-', '').slice(0, 2)}
                    </span>
                    <div className="cx-row-main">
                      <b>{c.sku}</b>
                      <span>{c.name}</span>
                    </div>
                    <div className="cx-row-meta">
                      <span className="cx-tag">{c.on_hand} шт</span>
                      {low && <span className="badge badge-red">нехватка</span>}
                      {!low && <span className="badge badge-green">ок</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{ marginTop: 12 }}>
              Ждём поставки: {(status.incoming || []).map((s: any) => `${s.shipment_id} · ${s.sku} ×${s.quantity} · ${fmtDate(s.expected_at)}`).join('  ·  ') || '—'}
            </div>
            {status.active_batch && <div className="info" style={{ marginTop: 12 }}>Запущена партия: {(status.active_batch.finished_sku === 'FG-AIR' ? 'air' : 'air plus')} ×{status.active_batch.batch_qty}, будет готова {fmtDate(status.active_batch.batch_ready_at)}</div>}
          </>
        ) : <div>Загрузка…</div>}
      </div>

      <div className="card" style={{ borderColor: 'rgba(255,94,0,0.3)' }}>
        <div className="card-head-row">
          <div className="sp">
            <h3><span className="n">02</span> План партии</h3>
            <div className="muted">Проверка демо: 8 air plus к 03.11 невозможны — CO2 2/8, пополнение 04.11 09:00.</div>
          </div>
          {plan && <span className={plan.feasible ? 'badge badge-green' : 'badge badge-red'}>{plan.feasible ? 'выполнимо' : 'невозможно'}</span>}
        </div>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <label>Товар
            <select value={sku} onChange={(e) => setSku(e.target.value)}>
              <option value="FG-PLUS">FG-PLUS</option>
              <option value="FG-AIR">FG-AIR</option>
            </select>
          </label>
          <label>Количество<input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 90 }} /></label>
          <label>Начать<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <button onClick={doPlan} disabled={busy}>{busy ? 'Считаем…' : 'Спланировать ›'}</button>
          <button className="ghost" onClick={doStart}>Запустить</button>
        </div>
        {msg && <div className="info">{msg}</div>}
        {plan && (
          <div>
            <div style={{ fontSize: 15, marginBottom: 6 }}>
              <b style={{ fontWeight: 600 }}>{plan.feasible ? 'Выполнимо' : 'Невозможно'}</b>
              {plan.out_of_horizon && <span className="badge badge-red" style={{ marginLeft: 8 }}>не укладываемся в 02–06.11</span>}
            </div>
            <div className="muted">{plan.explanation}</div>
            {plan.shortage?.length > 0 && (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Компонент</th><th>нужно</th><th>есть</th><th>дефицит</th></tr></thead>
                  <tbody>
                    {plan.shortage.map((s: any) => (
                      <tr key={s.sku}><td className="mono">{s.sku}</td><td className="mono">{s.need}</td><td className="mono">{s.have}</td><td className="red">{s.deficit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {plan.batch_ready_at && <div style={{ marginTop: 10 }}>Партия будет готова: <b className="mono">{fmtDate(plan.batch_ready_at)}</b></div>}
            {plan.timeline?.length > 0 && <Gantt timeline={plan.timeline} />}
          </div>
        )}
      </div>
    </div>
  );
}
