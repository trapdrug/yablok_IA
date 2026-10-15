import { useState } from 'react';
import { api, ProductionResult, StateResponse } from '../api';

export function ProductionTab({ data }: { data: StateResponse }) {
  const [sku, setSku] = useState('AIR');
  const [qty, setQty] = useState(10);
  const [targetDate, setTargetDate] = useState('');
  const [result, setResult] = useState<ProductionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    try {
      const target = targetDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      setResult(await api.productionCheck({ sku, qty, targetDate: target }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  };

  return (
    <section>
      <h2>Производство: можно ли собрать партию?</h2>
      <div className="form-row">
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
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        <button onClick={check}>Проверить</button>
      </div>
      {error && <p className="message">{error}</p>}
      {result && (
        <div className={result.possible ? 'answer ok' : 'answer fail'}>
          {result.possible ? (
            <p>
              Да: готово к {result.readyDate} (нужно {result.daysNeeded} раб. дней,
              с учётом брака — {result.requiredUnits} изделий).
            </p>
          ) : (
            <p>Нет: {result.reason}</p>
          )}
        </div>
      )}
      <h3>Комплектующие на складе</h3>
      <table>
        <tbody>
          {Object.entries(data.state.components).map(([name, qty]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}