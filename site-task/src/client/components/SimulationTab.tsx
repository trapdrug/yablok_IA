import { useState } from 'react';
import { api, DelayReport, StateResponse } from '../api';

export function SimulationTab({ data }: { data: StateResponse }) {
  const planned = data.state.shipments.filter((s) => s.status === 'PLANNED');
  const [shipmentId, setShipmentId] = useState(planned[0]?.id ?? '');
  const [days, setDays] = useState(3);
  const [report, setReport] = useState<DelayReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const simulate = async () => {
    try {
      setReport(await api.simulateDelay(shipmentId, days));
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setReport(null);
    }
  };

  return (
    <section>
      <h2>Симуляция задержки поставки (read-only)</h2>
      <div className="form-row">
        <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
          {planned.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} ({s.sku} x{s.qty}, {s.expectedDate})
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
        <button onClick={simulate}>Симулировать</button>
      </div>
      {message && <p className="message">{message}</p>}
      {report && (
        <>
          <h3>Заказы в зоне риска после задержки ({report.atRisk.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Заказ</th>
                <th>SKU</th>
                <th>Кол-во</th>
                <th>Срок</th>
                <th>Дефицит</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {report.atRisk.map((r) => (
                <tr key={r.orderId} className="row-risk">
                  <td>{r.orderId}</td>
                  <td>{r.sku}</td>
                  <td>{r.qty}</td>
                  <td>{r.shipBy}</td>
                  <td>{r.deficit}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Ново попавшие в риск ({report.newlyAtRisk.length})</h3>
          <p>
            {report.newlyAtRisk.length === 0
              ? 'Нет новых заказов в зоне риска.'
              : report.newlyAtRisk.map((r) => r.orderId).join(', ')}
          </p>
        </>
      )}
    </section>
  );
}