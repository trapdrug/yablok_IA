import { useState } from 'react';
import { api, StateResponse } from '../api';

export function ShipmentsTab({ data, onAction }: { data: StateResponse; onAction: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  const receive = async (id: string) => {
    try {
      await api.receive(id);
      setMessage('Поставка получена');
      onAction();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <h2>Поставки</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>SKU</th>
            <th>Кол-во</th>
            <th>Ожидаемая дата</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {data.state.shipments.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.sku}</td>
              <td>{s.qty}</td>
              <td>{s.expectedDate}</td>
              <td>{s.status}</td>
              <td>
                {s.status === 'PLANNED' && (
                  <button onClick={() => receive(s.id)}>Получить</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {message && <p className="message">{message}</p>}
    </section>
  );
}