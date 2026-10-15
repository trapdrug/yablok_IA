import { useCallback, useEffect, useMemo, useState } from 'react';
import { snapshot as fetchSnapshot, shipments as fetchShipments, adminReset, isMockMode, onMockMode } from './api';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Shipments from './pages/Shipments';
import Scenario from './pages/Scenario';
import AiChat from './components/AiChat';
import Landing from './pages/Landing';
import { fmtDate } from './format';

type Tab = 'dash' | 'orders' | 'ships' | 'scenario' | 'ai' | 'consult';
type View = 'landing' | 'app';

const NAV: { id: Tab; label: string; hint: string }[] = [
  { id: 'dash', label: 'Склад', hint: 'остатки и поставки' },
  { id: 'orders', label: 'Заказы', hint: 'резерв и отгрузка' },
  { id: 'ships', label: 'Поставки', hint: 'приём входящих' },
  { id: 'scenario', label: 'Задержка', hint: 'пробный расчёт' },
  { id: 'ai', label: 'ИИ-аналитик', hint: 'вопросы по данным' },
  { id: 'consult', label: 'Консультант', hint: 'простые ответы' },
];

/* Короткие подписи для нижней таб-панели на мобильных */
const TABBAR: { id: Tab; label: string }[] = [
  { id: 'dash', label: 'Склад' },
  { id: 'orders', label: 'Заказы' },
  { id: 'ships', label: 'Поставки' },
  { id: 'scenario', label: 'Задержка' },
  { id: 'ai', label: 'ИИ' },
  { id: 'consult', label: 'Советы' },
];

const SECTION: Record<Tab, { h: string; lead: string }> = {
  dash: { h: 'Склад', lead: 'Сколько товара в наличии и сколько свободно. Свободно = в наличии минус бронь. air — температура и влажность, air plus — плюс CO₂.' },
  orders: { h: 'Заказы', lead: 'Бронь — из свободного запаса, отгрузка — только из брони. Дата готовности считается по остаткам и поставкам.' },
  ships: { h: 'Поставки', lead: 'Поставки в пути. Приёмка добавляет товар на склад один раз, повтор отклоняется.' },
  scenario: { h: 'Проверка задержки', lead: 'Расчёт риска при переносе поставки на другую дату — результат в формате было / стало.' },
  ai: { h: 'ИИ-аналитик', lead: 'Отвечает только по данным программы. Номера и цифры — из базы, без выдумок.' },
  consult: { h: 'ИИ-консультант', lead: 'Простые ответы своими словами: что в наличии, что делать. Цифры — из базы.' },
};

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [tab, setTab] = useState<Tab>('dash');
  const [snap, setSnap] = useState<any>(null);
  const [ships, setShips] = useState<any[]>([]);
  const [mock, setMock] = useState(isMockMode());
  const [msg, setMsg] = useState('');
  const [fixture, setFixture] = useState<'simple' | 'extended'>('simple');

  const load = useCallback(async () => {
    try {
      const s = await fetchSnapshot();
      setSnap(s);
      try {
        const sh = await fetchShipments();
        setShips(sh);
      } catch { setShips(s?.shipments_expected || []); }
    } catch (e: any) {
      setMsg('Не удалось загрузить snapshot: ' + e.message);
    }
  }, []);

  useEffect(() => {
    load();
    return onMockMode(setMock);
  }, [load]);

  async function changeFixture(f: 'simple' | 'extended') {
    setFixture(f);
    setMsg('');
    try {
      await adminReset(f);
      await load();
    } catch (e: any) {
      setMsg('Reset: ' + e.message);
    }
  }

  function enter(t: Tab) {
    setTab(t);
    setView('app');
    window.scrollTo({ top: 0 });
  }

  function selectTab(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0 });
  }

  const air = snap?.stock?.find((s: any) => s.sku === 'FG-AIR');
  const plus = snap?.stock?.find((s: any) => s.sku === 'FG-PLUS');
  const atRisk = snap?.kpi?.at_risk || 0;
  const activeCount = snap?.kpi?.active_orders ?? 0;
  const sec = SECTION[tab];

  const counts: Record<Tab, number | null> = useMemo(() => ({
    dash: null,
    orders: activeCount || null,
    ships: snap?.kpi?.expected_shipments ?? null,
    scenario: atRisk > 0 ? atRisk : null,
    ai: null,
    consult: null,
  }), [activeCount, snap, atRisk]);

  const [consultOpen, setConsultOpen] = useState(false);

  const consultFab = (
    <>
      <button className="consult-fab" onClick={() => setConsultOpen(true)} title="Спросить консультанта">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
      </button>
      {consultOpen && (
        <div className="modal-overlay" onClick={() => setConsultOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>ИИ-консультант</b>
              <button className="ghost small" onClick={() => setConsultOpen(false)}>Закрыть</button>
            </div>
            <AiChat persona="consultant" compact />
          </div>
        </div>
      )}
    </>
  );

  if (view === 'landing') {
    return (<><Landing snap={snap} mock={mock} onEnter={enter} />{consultFab}</>);
  }

  return (
    <div className="work-app">
      {/* Единственная верхняя панель приложения — все глобальные действия только здесь */}
      <header className="work-top">
        <button className="work-back" onClick={() => setView('landing')} title="Вернуться на главную">
          ← Главная
        </button>
        <div className="work-brand">
          <img className="fc-logo-img sm" src="/yabloki-logo.png" alt="ЯблокИИ" />
          <span><b>Яблок<span className="ii">ИИ</span></b> · консоль</span>
        </div>
        <div className="work-top-right">
          <span className="work-live" title={snap ? fmtDate(snap.now) : ''}>
            <span className={mock ? 'fc-dot mock' : 'fc-dot'} />
            {mock ? 'демо' : 'онлайн'} · {snap ? fmtDate(snap.now) : '—'}
          </span>
          <button className="work-btn" onClick={load}>Обновить</button>
          <select
            className="work-select"
            value={fixture}
            onChange={(e) => changeFixture(e.target.value as 'simple' | 'extended')}
            title="Набор данных"
          >
            <option value="simple">простой</option>
            <option value="extended">расширенный</option>
          </select>
        </div>
      </header>

      <div className="work-layout">
        {/* Единственная навигация — боковая, без дублей в контенте */}
        <aside className="work-side">
          <nav className="work-nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={tab === n.id ? 'work-nav-btn active' : 'work-nav-btn'}
                onClick={() => selectTab(n.id)}
              >
                <span className="work-nav-main">
                  <span className="work-nav-label">{n.label}</span>
                  <span className="work-nav-hint">{n.hint}</span>
                </span>
                {counts[n.id] != null && (
                  <span className={n.id === 'scenario' && atRisk > 0 ? 'work-count risk' : 'work-count'}>
                    {counts[n.id]}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="work-side-foot">
            <div className="work-mini">
              air <b>{air?.on_hand ?? '—'}</b> · своб. <b>{air?.free ?? '—'}</b>
            </div>
            <div className="work-mini">
              air plus <b>{plus?.on_hand ?? '—'}</b> · своб. <b>{plus?.free ?? '—'}</b>
            </div>
          </div>
        </aside>

        {/* Контент — один раздел за раз, без маркетинговых блоков */}
        <main className="work-main">
          {mock && (
            <div className="mock-banner">
              <span>▲</span> Нет связи с сервером :8000 — показываю сохранённые демо-данные. Запустите сервер для живых данных.
            </div>
          )}
          {msg && <div className="info">{msg}</div>}

          <div className="work-head">
            <h1>{sec.h}</h1>
            <p>{sec.lead}</p>
          </div>

          <div className="work-card" key={tab}>
            {tab === 'dash' && <Dashboard snapshot={snap} shipmentsAll={ships} />}
            {tab === 'orders' && <Orders snapshot={snap} onChange={load} />}
            {tab === 'ships' && <Shipments snapshot={snap} shipmentsAll={ships} onChange={load} />}
            {tab === 'scenario' && <Scenario snapshot={snap} />}
            {/* Оба чата всегда смонтированы: история не теряется при переключении */}
            <div style={{ display: tab === 'ai' ? undefined : 'none' }}>
              <AiChat persona="analyst" />
            </div>
            <div style={{ display: tab === 'consult' ? undefined : 'none' }}>
              <AiChat persona="consultant" />
            </div>
          </div>

          <div className="work-foot">ЯблокИИ · время в программе 02.11 09:00 МСК · справка :8000/docs</div>
        </main>
      </div>

      {/* Нижняя таб-панель — только на мобильных, вместо боковой навигации */}
      <nav className="work-tabbar" aria-label="Разделы приложения">
        {TABBAR.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? 'work-tab active' : 'work-tab'}
            onClick={() => selectTab(n.id)}
            aria-current={tab === n.id ? 'page' : undefined}
          >
            <span className="work-tab-label">{n.label}</span>
            {counts[n.id] != null && (
              <span className={n.id === 'scenario' && atRisk > 0 ? 'work-tab-count risk' : 'work-tab-count'}>
                {counts[n.id]}
              </span>
            )}
          </button>
        ))}
      </nav>
      {consultFab}
    </div>
  );
}
