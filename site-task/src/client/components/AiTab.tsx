import { useState } from 'react';
import { api } from '../api';

export function AiTab() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.ask(question);
      setAnswer(result.answer);
      setProvider(result.provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>ИИ-аналитик</h2>
      <p className="hint">
        Ответ строится строго по актуальному снимку состояния склада.
        {provider && (
          <span className="badge">провайдер: {provider}</span>
        )}
      </p>
      <textarea
        rows={3}
        placeholder="Например: Сколько Air сейчас свободно к отгрузке?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <div className="form-row">
        <button onClick={ask} disabled={busy}>
          {busy ? 'Думаем…' : 'Спросить'}
        </button>
      </div>
      {error && <p className="message">{error}</p>}
      {answer && (
        <div className="answer">
          <pre>{answer}</pre>
        </div>
      )}
    </section>
  );
}