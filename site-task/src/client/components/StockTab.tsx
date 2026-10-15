import { StateResponse } from '../api';

export function StockTab({ data }: { data: StateResponse }) {
  const skus = Object.keys(data.state.stock);
  return (
    <section>
      <h2>Остатки</h2>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Физический</th>
            <th>Резерв</th>
            <th>Свободно</th>
            <th>Нехватка</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((sku) => {
            const item = data.state.stock[sku];
            const free = item.physical - item.reserved;
            const shortage = data.shortage[sku] ?? 0;
            return (
              <tr key={sku} className={shortage > 0 ? 'row-risk' : ''}>
                <td>{sku}</td>
                <td>{item.physical}</td>
                <td>{item.reserved}</td>
                <td>{free}</td>
                <td>{shortage > 0 ? `−${shortage}` : '0'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Комплектующие</h2>
      <table>
        <thead>
          <tr>
            <th>Компонент</th>
            <th>Кол-во</th>
          </tr>
        </thead>
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