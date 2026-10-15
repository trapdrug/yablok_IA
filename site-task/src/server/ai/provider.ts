import { Snapshot, mockAnalyze } from '../../domain/ai';

export interface AiResult {
  answer: string;
  provider: 'anthropic' | 'openai' | 'mock';
}

const SYSTEM_PROMPT = [
  'Ты — аналитик склада учебного предприятия.',
  'Отвечай СТРОГО на основе переданного JSON-снимка состояния.',
  'Не выдумывай цифры — ссылайся на конкретные числа из снимка.',
  'Если данных недостаточно — скажи об этом.',
  'Отвечай кратко, на языке вопроса.',
].join(' ');

function userPrompt(question: string, snapshot: Snapshot): string {
  return `Снимок состояния:\n${JSON.stringify(snapshot)}\n\nВопрос: ${question}`;
}

/**
 * Приоритет провайдеров: ANTHROPIC_API_KEY -> OPENAI_API_KEY -> mock-аналитик.
 */
export async function askAi(question: string, snapshot: Snapshot): Promise<AiResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (anthropicKey) {
    return callAnthropic(anthropicKey, question, snapshot);
  }
  if (openaiKey) {
    return callOpenAI(openaiKey, question, snapshot);
  }
  return { answer: mockAnalyze(question, snapshot), provider: 'mock' };
}

async function callAnthropic(
  key: string,
  question: string,
  snapshot: Snapshot,
): Promise<AiResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt(question, snapshot) }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  return { answer: text, provider: 'anthropic' };
}

async function callOpenAI(key: string, question: string, snapshot: Snapshot): Promise<AiResult> {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(question, snapshot) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`openai error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return { answer: data.choices[0]?.message?.content ?? '', provider: 'openai' };
}