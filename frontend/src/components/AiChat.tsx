import { useEffect, useRef, useState } from 'react';
import { aiAsk } from '../api';

const CHIPS_ANALYST = [
  'Можно ли отдать 5 air plus новому клиенту?',
  'Почему ORD-003 нельзя отгрузить целиком?',
  'Что будет при задержке IN-AIR-01?',
  'Когда придёт IN-UNKNOWN?',
];

const CHIPS_CONSULT = [
  'Что у нас на складе?',
  'Что такое бронь?',
  'Какой заказ может опоздать?',
  'Что делать, если поставка опаздывает?',
];

type Msg = { role: 'user' | 'ai'; text: string };

export default function AiChat({
  persona = 'analyst',
  compact = false,
}: {
  persona?: 'analyst' | 'consultant';
  compact?: boolean;
}) {
  const isConsult = persona === 'consultant';
  const CHIPS = isConsult ? CHIPS_CONSULT : CHIPS_ANALYST;
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [facts, setFacts] = useState<any>(null);
  const [via, setVia] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showFacts, setShowFacts] = useState(false);
  const histRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = histRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, loading]);

  async function ask(question: string) {
    const qq = question.trim();
    if (!qq || loading) return;
    setLoading(true);
    setErr('');
    const history = msgs.slice(-6).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    }));
    setMsgs((prev) => [...prev, { role: 'user', text: qq }]);
    setQ('');
    try {
      let scenario: any = undefined;
      if (/задерж/i.test(qq) && /IN-AIR-01/i.test(qq)) {
        scenario = { shipment_id: 'IN-AIR-01', new_expected_at: '2026-11-05T10:00:00+03:00' };
      }
      const r = await aiAsk(qq, scenario, persona, history);
      setMsgs((prev) => [...prev, { role: 'ai', text: r.answer || '' }]);
      setFacts(r.facts_used || null);
      setVia(r.via || '');
    } catch (e: any) {
      setErr(e.message + (e.hint ? ' — ' + e.hint : ''));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? 'ai-chat compact' : 'ai-chat'}>
      <div className="fc-section-label" style={{ marginBottom: 10 }}>
        {isConsult ? 'ЯблокИИ · консультант' : 'ЯблокИИ · ответы по данным'}
      </div>
      <h3>{isConsult ? 'ИИ-консультант' : 'ИИ-аналитик склада'}</h3>
      <div className="muted">
        {isConsult
          ? 'Спросите своими словами — объясню просто и подскажу, что делать.'
          : 'Отвечаю только по данным из программы. Номера и цифры — из базы. Неизвестную поставку так и назову.'}
      </div>
      <div className="chips">
        {CHIPS.map((c) => (
          <button key={c} className="chip" onClick={() => ask(c)}>
            {c}
          </button>
        ))}
      </div>
      {msgs.length > 0 && (
        <div className="ai-history" ref={histRef}>
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'msg msg-user' : 'msg msg-ai'}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          {loading && <div className="msg msg-ai msg-typing">Думаем…</div>}
        </div>
      )}
      <div className="ai-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Спросите про склад, заказы, задержки…"
          onKeyDown={(e) => { if (e.key === 'Enter') ask(q); }}
        />
        <button onClick={() => ask(q)} disabled={loading}>{loading ? 'Думаем…' : 'Спросить ›'}</button>
      </div>
      {err && <div className="error">{err}</div>}
      {facts && (
        <div className="facts">
          <button className="link" onClick={() => setShowFacts(!showFacts)}>
            {showFacts ? 'скрыть данные ↑' : 'на каких данных основан →'}
          </button>
          {showFacts && <pre>{JSON.stringify(facts, null, 2)}</pre>}
        </div>
      )}
      {via && (
        <div className="via-line">
          {via === 'ai' ? '● ответ нейросети' : '● точные данные из программы'}
        </div>
      )}
    </div>
  );
}
