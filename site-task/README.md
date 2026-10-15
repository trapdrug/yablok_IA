# Учебная модель предприятия «Air / Air Plus»

Веб-приложение, моделирующее работу склада и производства компании, выпускающей устройства **Air** (температура + влажность) и **Air Plus** (температура + влажность + CO₂): остатки, заказы, поставки, read-only симуляция задержки поставок, ИИ-аналитик и производственный модуль.

## Быстрый старт

```bash
npm install
npm run dev
```

- UI: http://localhost:5173 (Vite, проксирует `/api` → `:3001`)
- API: http://localhost:3001

Production-режим:

```bash
npm run build
npm start        # Express раздаёт API и собранный клиент из dist/client на :3001
```

Другие скрипты:

| Скрипт | Назначение |
|---|---|
| `npm test` | vitest: 38 тестов домена (7 файлов) |
| `npm run seed` | генерация `data/seed.json` (детерминированный PRNG, seed=42) |
| `npm run import` | импорт архива компании → `data/seed.json` (опционально, см. ниже) |

При первом старте сервер сам создаёт `data/seed.json`, если файла нет.

## Выбор стека и обоснование

**TypeScript + React (Vite) + Express.** Отказ от Next.js:

1. **1:1 соответствие архитектуре из ТЗ**: чистый домен (`src/domain/*`, без I/O) + явный REST API (Express) + React-UI. В Next.js API-слой спрятан в route handlers, а «чистый домен» приходится вытаскивать из server-модулей — лишняя сложность без пользы.
2. **Лёгкость зависимостей** (прямое требование ТЗ): Next.js тянет фреймворк (SSR, компиляция, runtime) для задачи, где SSR/SEO не нужны — это внутренний инструмент.
3. **Скорость**: `vite build` собирает только клиент; сервер запускается через `tsx` без отдельной сборки.
4. **Тестируемость**: доменные функции тестируются vitest'ом напрямую, без bundler'а и без server-обвязки.
5. **Один `npm run dev`**: `concurrently` поднимает Express (порт 3001) и Vite (порт 5173), Vite проксирует `/api` → `:3001` — CORS в dev не нужен.

Next.js был бы оправдан, если бы требовался SSR/SEO или единый деплой-артефакт — для учебного внутреннего инструмента это не требуется.

## Архитектура

```
site-task/
├── config/company.json     # SKU, BOM, брак, нормы времени, правила риска
├── data/seed.json          # seed + файл персистентности (создаётся автоматически)
├── scripts/
│   ├── generate-seed.ts    # генерация seed (mulberry32, seed=42)
│   └── import.ts           # ОПЦИОНАЛЬНО: архив компании → data/seed.json
├── src/
│   ├── shared/
│   │   ├── types.ts        # доменные типы
│   │   └── schemas.ts      # zod-схемы на границе API
│   ├── domain/             # ЧИСТЫЕ функции, без I/O, без side effects
│   │   ├── state.ts        # cloneState, free(state, sku), todayISO
│   │   ├── invariants.ts   # DomainError, assertInvariants
│   │   ├── orders.ts       # createOrder, reserveOrder, shipOrder
│   │   ├── shipments.ts    # receiveShipment
│   │   ├── shortage.ts     # computeShortage, computeRisk
│   │   ├── delaySimulation.ts  # simulateDelay (deep clone → сдвиг → пересчёт)
│   │   ├── production.ts   # canProduce (BOM + брак + рабочее время)
│   │   └── ai.ts           # buildSnapshot, mockAnalyze
│   ├── server/
│   │   ├── main.ts         # bootstrap, в prod раздаёт dist/client
│   │   ├── app.ts          # маршруты + централизованный обработчик ошибок
│   │   ├── store.ts        # in-memory singleton, атомарное сохранение (tmp + rename)
│   │   └── ai/provider.ts # Anthropic → OpenAI → mock (по env)
│   └── client/
│       ├── App.tsx         # вкладки, загрузка /api/state, refetch после действий
│       ├── api.ts          # типизированные fetch-обёртки
│       └── components/     # StockTab, OrdersTab, ShipmentsTab, SimulationTab, AiTab, ProductionTab
└── tests/                  # vitest: invariants, orders, shipments, shortage,
                            # delaySimulation, production, ai.mock
```

Ключевые принципы:

- **Чистый домен**: функции принимают `state`, возвращают новое состояние или бросают `DomainError`; мутация на месте запрещена.
- **`free` — только функция**: `free(state, sku) = physical − reserved`. Отдельного поля нет, хранится только `physical` и `reserved`.
- **Инварианты** (`physical ≥ 0`, `reserved ≥ 0`, `reserved ≤ physical`) проверяются после каждой мутации.
- **Персистентность**: in-memory + атомарная запись `data/seed.json` (tmp-файл + `fs.renameSync`) после каждой мутации.

## Где конфиг

- `config/company.json` — SKU, BOM, `defectRate: 0.05`, `hoursPerUnit: 0.4`, `shiftsPerDay: 2`, `hoursPerShift: 8` (≈40 изделий/день), правила риска. Данные компании не хардкодятся в коде.
- `data/seed.json` — данные (остатки, комплектующие, заказы, поставки).

## Подключение API-ключа

Скопируйте `.env.example` в `.env` и заполните нужное:

| Переменная | Назначение |
|---|---|
| `ANTHROPIC_API_KEY` | ключ Anthropic (приоритет 1) |
| `ANTHROPIC_MODEL` | модель, по умолчанию `claude-sonnet-4-5` |
| `OPENAI_API_KEY` | ключ OpenAI-совместимого API (приоритет 2) |
| `OPENAI_BASE_URL` | по умолчанию `https://api.openai.com/v1` |
| `OPENAI_MODEL` | по умолчанию `gpt-4o-mini` |
| `PORT` | порт сервера, по умолчанию `3001` |

Приоритет: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → **mock-аналитик**. Без ключей работает детерминированный mock: ответ вычисляется из JSON-снимка текущего состояния (без заготовленных текстов), в UI виден бейдж провайдера (`anthropic` / `openai` / `mock`).

## Добавление данных компании

- `npm run import company-archive` — если появится архив (`products.json`, `orders.json`, `stock.json`, `incoming.json`), скрипт зальёт его в `data/seed.json`. Сейчас — заглушка с понятным сообщением.
- `npm run seed` — генерация нового seed (детерминированная, seed=42; даты — относительно текущего дня).
- `data/seed.json` можно редактировать вручную (инварианты: `reserved ≤ physical`).

## Чтение отчёта симуляции

Вкладка «Симуляция»: выбираете поставку и N дней → `POST /api/simulate/delay`. Симуляция **read-only**: состояние клонируется (deep clone), в копии сдвигается дата поставки, пересчитывается риск; исходное состояние не трогается.

Поля ответа:

- `shipmentId`, `days` — параметры симуляции;
- `atRisk` — заказы под угрозой: `{orderId, sku, qty, shipBy, deficit, reason}`;
- `newlyAtRisk` — заказы, которые попали в риск именно из-за задержки (в исходном состоянии риска не было).

## Справочник API

Все тела валидируются zod'ом на границе. Ошибки: `DomainError` → 400 `{error: message}`; `ZodError` → 400 `{error: 'validation failed', details}`; неизвестный id → 404.

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/api/state` | — | `{ state, shortage, risk }` |
| POST | `/api/orders` | `{client, sku, qty, shipBy, priority?}` | созданный заказ (201) |
| POST | `/api/orders/:id/reserve` | — | обновлённый заказ |
| POST | `/api/orders/:id/ship` | — | обновлённый заказ |
| POST | `/api/shipments/:id/receive` | — | обновлённая поставка |
| POST | `/api/simulate/delay` | `{shipmentId, days}` | отчёт симуляции (read-only) |
| POST | `/api/ai/ask` | `{question}` | `{answer, provider}` |
| POST | `/api/production/check` | `{sku, qty, targetDate}` | `{possible, readyDate?, reason?}` |

## Тесты

`npm test` — 38 тестов в 7 файлах:

- `invariants` — инварианты после последовательностей действий;
- `orders` — создание/резерв/отгрузка, двойное резервирование, повторные действия;
- `shipments` — приём поставок, повторный приём;
- `shortage` — формулы shortage и риска;
- `delaySimulation` — снапшот (исходное состояние не изменилось), задержка, `days=0`, ошибки;
- `production` — комплектующие, рабочее время, брак (`ceil(qty / 0.95)`);
- `ai.mock` — цифры из снимка, детерминированность.

## Ограничения MVP

- нет аутентификации и многопользовательской конкурентности (in-memory, один процесс);
- производство — только read-only проверка «можно ли», без фактического списания комплектующих;
- один склад, два SKU (расширение — через `config/company.json`);
- mock-аналитик — эвристика по ключевым словам, не LLM;
- нет истории операций/аудита;
- персистентность — один JSON-файл (не БД).