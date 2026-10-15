import { fmtDate } from '../format';

export type LandingTab = 'dash' | 'orders' | 'ships' | 'scenario' | 'ai' | 'consult';

export default function Landing({
  snap,
  mock,
  onEnter,
}: {
  snap: any;
  mock: boolean;
  onEnter: (tab: LandingTab) => void;
}) {
  const air = snap?.stock?.find((s: any) => s.sku === 'FG-AIR');
  const plus = snap?.stock?.find((s: any) => s.sku === 'FG-PLUS');
  const atRisk = snap?.kpi?.at_risk ?? 0;
  const active = snap?.kpi?.active_orders ?? '—';

  return (
    <div className="fc-app">
      {/* Тонкая служебная полоса — только один раз, только на визитке */}
      <div className="fc-topbar">
        <div className="fc-topbar-inner">
          <span><span className="t-ok">●</span> Минцифры · аккредитовано с 2014</span>
          <span className="t-sep">/</span>
          <span>ISO 9001</span>
        </div>
      </div>

      <header className="fc-header">
        <div className="fc-header-inner">
          <div className="fc-brand">
            <div className="fc-logo">F</div>
            <div className="fc-brand-name"><b>FIRECODE</b></div>
          </div>
          <span className="fc-x">×</span>
          <div className="fc-brand">
            <img className="fc-logo-img" src="./yabloki-logo.png" alt="ЯблокИИ" />
            <div className="fc-brand-name"><b>Яблок<span className="ii big">ИИ</span></b></div>
          </div>
          <div className="fc-header-right">
            <a className="fc-phone" href="tel:+74991305177">+7 (499) 130-51-77</a>
          </div>
        </div>
      </header>

      {/* HERO — единственное красивое место */}
      <section className="fc-hero">
        <div className="fc-hero-orb o1" />
        <div className="fc-hero-orb o2" />
        <div className="fc-hero-inner">
          <div>
            <div className="fc-eyebrow"><i />Firecode × ЯблокИИ · цифровой двойник</div>
            <h1>Складской <em>интеллект</em> <span className="grad">ЯблокИИ</span></h1>
            <p className="fc-hero-lead">
              На примере датчиков: air и air plus.
            </p>
            <div className="fc-hero-cta">
              <button className="btn-indigo" onClick={() => onEnter('dash')}>Открыть приложение ›</button>
            </div>
          </div>

          {/* Живая витрина — только цифры, без действий */}
          <div className="fc-hero-card">
            <div className="fc-hero-card-top">
              <span className="d r" /><span className="d y" /><span className="d g" />
              <span className="t">firecode × yabloki</span>
              <span className="live"><span className={mock ? 'fc-dot mock' : 'fc-dot'} />{mock ? 'демо-данные' : 'сервер :8000'}</span>
            </div>
            <div className="fc-hero-card-body">
              <div className="fc-hero-kpis">
                <div className="fc-hero-kpi">
                  <div className="k">air · <span style={{ whiteSpace: 'nowrap' }}>FG-AIR</span></div>
                  <div className="v">{air?.on_hand ?? '—'}<small> шт</small></div>
                  <div className="s">своб. {air?.free ?? '—'} · бронь {air?.reserved ?? '—'}</div>
                </div>
                <div className="fc-hero-kpi">
                  <div className="k">air plus · <span style={{ whiteSpace: 'nowrap' }}>FG-PLUS</span></div>
                  <div className="v">{plus?.on_hand ?? '—'}<small> шт</small></div>
                  <div className="s">своб. {plus?.free ?? '—'} · бронь {plus?.reserved ?? '—'}</div>
                </div>
                <div className="fc-hero-kpi">
                  <div className="k">Активные заказы</div>
                  <div className="v">{active}</div>
                  <div className="s">в пути {snap?.kpi?.expected_shipments ?? '—'} поставок</div>
                </div>
                <div className={atRisk > 0 ? 'fc-hero-kpi alert' : 'fc-hero-kpi'}>
                  <div className="k">Возможные риски</div>
                  <div className="v">{atRisk}</div>
                  <div className="s">{atRisk > 0 ? 'смотрите проверку задержки' : 'все в срок'}</div>
                </div>
              </div>
              <div className="fc-hero-card-foot" style={{ border: 'none', padding: '4px 2px 0' }}>
                <span className="ok">●</span>
                <span>{snap ? fmtDate(snap.now) + ' МСК · данные с сервера' : 'загрузка…'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="fc-body">
        {/* Что умеет — 3 карточки, каждая ведёт в свой раздел приложения */}
        <section className="fc-section" style={{ paddingTop: 44 }}>
          <div className="fc-section-head">
            <div className="fc-section-head-main">
              <div className="fc-section-label">Возможности</div>
              <h2>Что умеет <em>двойник</em></h2>
              <p>Три раздела для ежедневной работы. Вся работа — внутри приложения, здесь только обзор.</p>
            </div>
          </div>
          <div className="fc-plans">
            <div className="fc-plan as-tab" role="button" tabIndex={0} onClick={() => onEnter('dash')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEnter('dash'); }}>
              <h3>Остатки <em>на складе</em></h3>
              <div className="price">air 18 / air plus 8 <small>· свободно 12 / 3</small></div>
              <ul>
                <li>Остатки, бронь и поставки в пути</li>
                <li>Новые заказы и отгрузка</li>
                <li>Приёмка поставок</li>
              </ul>
            </div>
            <div className="fc-plan hot as-tab" role="button" tabIndex={0} onClick={() => onEnter('scenario')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEnter('scenario'); }}>
              <h3>ИИ <em>анализ</em></h3>
              <div className="price">Поставка air → 05.11 <small>· склад не меняется</small></div>
              <ul>
                <li>Активные заказы и нехватка</li>
                <li>Риск опоздания каждого заказа</li>
                <li>Что будет при задержке поставки</li>
              </ul>
            </div>
            <div className="fc-plan as-tab" role="button" tabIndex={0} onClick={() => onEnter('consult')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEnter('consult'); }}>
              <h3>ИИ <em>консультант</em></h3>
              <div className="price">Вопросы про склад <small>· отвечает по данным</small></div>
              <ul>
                <li>Вопросы о состоянии склада</li>
                <li>Причины рисков простыми словами</li>
                <li>Ответы с цифрами из данных</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Доверие — одна строка */}
        <section className="fc-section" style={{ paddingBottom: 8 }}>
          <div className="fc-trust-big">
            <div className="fc-trust-hero">
              <div className="t">Аккредитовано</div>
              <b>Минцифры России</b>
              <span>В реестре аккредитованных ИТ-компаний — с 17.07.2014.</span>
            </div>
            <div className="fc-trust-hero">
              <div className="t">Сертифицировано</div>
              <b>ISO 9001</b>
              <span>Менеджмент качества, NDA, постоплата, замена по SLA.</span>
            </div>
          </div>
        </section>
      </div>

      <footer className="fc-footer">
        <div className="fc-footer-inner" style={{ paddingTop: 32 }}>
          <div className="fc-footer-top">
            <div>
              <div className="fc-brand">
                <div className="fc-logo">F</div>
                <div className="fc-brand-name"><b>FIRECODE</b></div>
              </div>
              <p>Firecode × ЯблокИИ — учебный двойник склада: air и air plus, заказы, поставки, пробные расчёты и производство. Исполнитель — ЯблокИИ.</p>
            </div>
            <div className="fc-footer-contacts">
              <a href="tel:+74991305177">+7 (499) 130-51-77</a>
              <a href="mailto:info@firecode.ru">info@firecode.ru</a>
              <span>Ростов-на-Дону · СПб · Самара · Ульяновск</span>
            </div>
          </div>
          <div className="fc-footer-bottom">
            <span>© 2008–2026 Firecode × ЯблокИИ</span>
            <span><button className="link" onClick={() => onEnter('dash')}>Открыть приложение →</button></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
