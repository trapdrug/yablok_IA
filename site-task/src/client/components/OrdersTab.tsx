import { useState } from 'react';
import { api, StateResponse } from '../api';

export function OrdersTab({ data, onAction }: { data: StateResponse; onAction: () => void }) {
  const [client, setClient] = useState('');
  const [sku, setSku] = useState('AIR');
  const [qty, setQty] = useState(1);
  const [shipBy, setShipBy] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [message, setMessage] = useState<string | null>(null);

  const riskIds = new Set(data.risk.map((r) => r.orderId));
  const riskByOrder = new Map(data.risk.map((r) => [r.orderId, r]));

  const today = new Date().toISOString().slice(0, 10);

  const createOrder = async () => {
    try {
      await api.createOrder({
        client,
        sku,
        qty,
        createdAt: today,
        shipBy: shipBy || today,
        priority,
      });
      setMessage('Заказ создан');
      setClient('');
      onAction();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      setMessage(okMsg);
      onAction();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <h2>Активные заказы</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Клиент</th>
            <th>SKU</th>
            <th>Кол-во</th>
            <th>Создан</th>
            <th>Срок</th>
            <th>Статус</th>
            <th>Приоритет</th>
            <th>Риск</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {data.state.orders.map((o) => {
            const risk = riskByOrder.get(o.id);
            return (
              <tr key={o.id} className={risk ? 'row-risk' : ''}>
                <td>{o.id}</td>
                <td>{o.client}</td>
                <td>{o.sku}</td>
                <td>{o.qty}</td>
                <td>{o.createdAt}</td>
                <td>{o.shipBy}</td>
                <td>{o.status}</td>
                <td>{o.priority}</td>
                <td>{risk ? `дефицит ${risk.deficit}` : '—'}</td>
                <td>
                  {o.status === 'NEW' && (
                    <button onClick={() => act(() => api.reserve(o.id), 'Резерв подтверждён')}>
                      Резерв
                    </button>
                  )}
                  {o.status === 'RESERVED' && (
                    <button onClick={() => act(() => api.ship(o.id), 'Отгружено')}>Отгрузить</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Новый заказ</h2>
      <div className="form-row">
        <input
          placeholder="Клиент"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        />
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          <option value="AIR">AIR</option>
          <option value="AIR_PLUS">AIR_PLUS</option>
        </select>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
        <input type="date" value={shipBy} onChange={(e) => setShipBy(e.target.value)} />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="LOW">LOW</option>
          <option value="NORMAL">NORMAL</option>
          <option value="HIGH">HIGH</option>
        </select>
        <button onClick={createOrder}>Создать</button>
      </div>
      {message && <p className="message">{message}</p>}
    </section>
  );
}