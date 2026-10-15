import { useCallback, useEffect, useState } from 'react';
import { api, StateResponse } from './api';
import { Tabs } from './components/Tabs';
import { StockTab } from './components/StockTab';
import { OrdersTab } from './components/OrdersTab';
import { ShipmentsTab } from './components/ShipmentsTab';
import { SimulationTab } from './components/SimulationTab';
import { AiTab } from './components/AiTab';
import { ProductionTab } from './components/ProductionTab';

export default function App() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('stock');

  const refresh = useCallback(async () => {
    try {
      setData(await api.getState());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }
  if (!data) {
    return <div>Загрузка…</div>;
  }

  return (
    <div className="app">
      <h1>Учебная модель предприятия — Air / Air Plus</h1>
      <Tabs tab={tab} onChange={setTab} />
      {tab === 'stock' && <StockTab data={data} />}
      {tab === 'orders' && <OrdersTab data={data} onAction={refresh} />}
      {tab === 'shipments' && <ShipmentsTab data={data} onAction={refresh} />}
      {tab === 'simulation' && <SimulationTab data={data} />}
      {tab === 'ai' && <AiTab />}
      {tab === 'production' && <ProductionTab data={data} />}
    </div>
  );
}