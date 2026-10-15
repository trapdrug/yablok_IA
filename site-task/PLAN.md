# PLAN — учебная модель предприятия «Air / Air Plus»

> План составлен 15.10.2026. По нему разработчик реализует проект без дополнительных вопросов.
> Проверено: в `C:\Users\i-7 gigabyte\Desktop\site-task` есть только `aitask.md` (текст задачи).
> Архив компании (products.json, orders.json, stock.json, incoming.json, rules.md, questions.md) **отсутствует** →
> seed генерируется скриптом; `scripts/import.ts` делается опционально «на будущее».

---

## 1. Выбор стека и обоснование

**Выбран: TypeScript + React (Vite) + Node.js (Express).** Отказ от Next.js.

Обоснование (повторить в README):
1. **1:1 соответствие архитектуре из ТЗ**: чистый домен (`src/domain/*`, без I/O) + явный REST API (Express) + React-UI. В Next.js API-слой спрятан в route handlers, а «чистый домен» приходится вытаскивать из server-модулей — лишняя сложность без пользы.
2. **Лёгкость зависимостей** (прямое требование ТЗ «не добавлять тяжёлые зависимости»): Next.js тянет фреймворк (SSR, компиляция, runtime) для задачи, где SSR/SEO не нужны — это внутренний инструмент.
3. **Скорость**: `vite build` собирает только клиент; сервер запускается через `tsx` без отдельной сборки.
4. **Тестируемость**: доменные функции тестируются vitest'ом напрямую, без bundler'а и без server-обвязки.
5. **Один `npm run dev`**: `concurrently` поднимает Express (порт 3001) и Vite (порт 5173), Vite проксирует `/api` → `:3001` — CORS в dev не нужен.

Next.js был бы оправдан, если бы требовался SSR/SEO или единый деплой-артефакт — для учебного внутреннего инструмента это не требуется.

---

## 2. Структура папок и полный список файлов

```
site-task/
├── index.html                  # Vite entry: <div id="root"> + <script src="/src/client/main.tsx">
├── package.json                # скрипты и зависимости (см. §3)
├── tsconfig.json               # strict: true, moduleResolution: bundler, target ES2022
├── vite.config.ts              # @vitejs/plugin-react; server.proxy: '/api' → http://localhost:3001
├── vitest.config.ts            # environment: 'node', include: ['tests/**/*.test.ts', 'src/**/*.test.ts']
├── .env.example                # ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, PORT
├── .gitignore                  # node_modules, dist, .env, data/seed.json (сгенерированный)
├── README.md                   # см. §7
├── PLAN.md                     # этот файл
│
├── config/
│   └── company.json            # SKU, BOM, брак, нормы времени, правила риска (см. §4)
│
├── data/
│   └── seed.json               # seed + файл персистентности (создаётся скриптом, обновляется API)
│
├── scripts/
│   ├── generate-seed.ts        # генерация реалистичного seed (детерминированный PRNG, seed=42)
│   └── import.ts               # ОПЦИОНАЛЬНО: архив компании → data/seed.json (использовать, если архив появится)
│
├── src/
│   ├── shared/
│   │   ├── types.ts            # все доменные типы (см. §5)
│   │   └── schemas.ts          # zod-схемы на границе API: CreateOrderInput, DelayInput, AiAskInput, ProductionCheckInput
│   │
│   ├── domain/                 # ЧИСТЫЕ функции, без I/O, без side effects
│   │   ├── state.ts            # cloneState (deep clone), free(state, sku), skuList, todayISO()
│   │   ├── invariants.ts       # DomainError; assertInvariants(state): physical≥0, reserved≥0, reserved≤physical
│   │   ├── orders.ts           # createOrder, reserveOrder, shipOrder
│   │   ├── shipments.ts        # receiveShipment
│   │   ├── shortage.ts         # computeShortage, computeRisk (правила — §5.4)
│   │   ├── delaySimulation.ts  # simulateDelay (deep clone → сдвиг даты → пересчёт риска → отчёт)
│   │   ├── production.ts       # canProduce (BOM + брак + рабочее время)
│   │   └── ai.ts               # buildSnapshot(state, config) → JSON-строка; mockAnalyze(snapshot, question) → детерминированный ответ
│   │
│   ├── server/
│   │   ├── main.ts             # bootstrap: loadState → app.listen(PORT=3001); в prod раздаёт dist/client
│   │   ├── app.ts              # express app: json(), маршруты, централизованный обработчик ошибок (DomainError→400, ZodError→400, 404)
│   │   ├── store.ts            # in-memory singleton { state }; saveState — атомарно: запись в data/seed.json.tmp + fs.renameSync
│   │   └── routes/
│   │       ├── state.ts        # GET  /api/state
│   │       ├── orders.ts       # POST /api/orders; POST /api/orders/:id/reserve; POST /api/orders/:id/ship
│   │       ├── shipments.ts    # POST /api/shipments/:id/receive
│   │       ├── simulate.ts     # POST /api/simulate/delay  (read-only)
│   │       ├── ai.ts           # POST /api/ai/ask
│   │       └── production.ts   # POST /api/production/check
│   │
│   └── client/
│       ├── main.tsx            # ReactDOM.createRoot, импорт styles.css
│       ├── App.tsx             # layout + вкладки; загрузка /api/state; повторный fetch после каждого действия
│       ├── api.ts              # типизированные fetch-обёртки для всех 7+1 эндпоинтов
│       ├── styles.css          # минимальный CSS: таблицы, вкладки, .risk (красная подсветка), .shortage (жёлтая)
│       └── components/
│           ├── Tabs.tsx        # переключатель: Склад | Заказы | Поставки | Симуляция | ИИ | Производство
│           ├── StockTab.tsx    # таблица: SKU, physical, reserved, free, shortage; ниже — остатки комплектующих
│           ├── OrdersTab.tsx   # активные заказы (NEW/RESERVED) + подсветка риска; форма «создать заказ»; кнопки «Резервировать» / «Отгрузить»
│           ├── ShipmentsTab.tsx# таблица поставок + кнопка «Принять»
│           ├── SimulationTab.tsx # выбор поставки + N дней → кнопка «Симулировать» → отчёт (заказы под угрозой, причина, дефицит)
│           ├── AiTab.tsx       # чат: поле вопроса, история ответов, бейдж провайдера (anthropic/openai/mock)
│           └── ProductionTab.tsx # форма (SKU, X, дата D) → результат: дата готовности или причина
│
└── tests/
    ├── invariants.test.ts
    ├── orders.test.ts
    ├── shipments.test.ts
    ├── shortage.test.ts
    ├── delaySimulation.test.ts
    ├── production.test.ts
    └── ai.mock.test.ts
```

### Зависимости (package.json)

| Тип | Пакеты |
|---|---|
| dependencies | `express@^4.21`, `zod@^3`, `cors@^2.8`, `react@^18`, `react-dom@^18` |
| devDependencies | `typescript@^5`, `vite@^5`, `@vitejs/plugin-react@^4`, `vitest@^2`, `tsx@^4`, `concurrently@^9`, `@types/react`, `@types/react-dom`, `@types/express@^4`, `@types/cors`, `@types/node` |

HTTP-запросы к LLM — нативным `fetch` (Node 18+), без axios. Никаких других зависимостей.

### Скрипты npm

```jsonc
{
  "dev": "concurrently -k \"npm:dev:server\" \"npm:dev:client\"",
  "dev:server": "tsx watch src/server/main.ts",
  "dev:client": "vite",
  "build": "tsc --noEmit && vite build",
  "start": "tsx src/server/main.ts",
  "test": "vitest run",
  "seed": "tsx scripts/generate-seed.ts",
  "import": "tsx scripts/import.ts"
}
```

---

## 3. Модель данных и правила домена (без неоднозначностей)

### 3.1 Типы (`src/shared/types.ts`)

```ts
type Sku = 'AIR' | 'AIR_PLUS';
type Priority = 'LOW' | 'NORMAL' | 'HIGH';
type OrderStatus = 'NEW' | 'RESERVED' | 'SHIPPED';
type ShipmentStatus = 'PLANNED' | 'RECEIVED';

interface StockItem { physical: number; reserved: number; }   // free НЕ хранится
interface Order {
  id: string; client: string; sku: Sku; qty: number;
  createdAt: string; shipBy: string;          // ISO-даты (yyyy-mm-dd)
  status: OrderStatus; priority: Priority;
}
interface Shipment {
  id: string; sku: Sku; qty: number;
  expectedDate: string; status: ShipmentStatus;
}
interface State {
  stock: Record<Sku, StockItem>;
  components: Record<string, number>;         // остатки комплектующих (для производства)
  orders: Order[];
  shipments: Shipment[];
}
```

**Свободный остаток** — только функция: `free(state, sku) = state.stock[sku].physical − state.stock[sku].reserved`. Отдельного поля нет (требование ТЗ).

### 3.2 Инварианты (`src/domain/invariants.ts`)

- `physical ≥ 0`, `reserved ≥ 0`, `reserved ≤ physical` — проверяются `assertInvariants` после КАЖДОЙ мутации (вызывается внутри каждого доменного действия).
- Все доменные функции чистые: принимают `state`, возвращают `{ state: State, ... }` (новый объект) или бросают `DomainError` (message — человекочитаемая причина). Мутация на месте запрещена.

### 3.3 Действия

| Функция | Условия | Эффект |
|---|---|---|
| `createOrder(state, input)` | qty > 0; sku ∈ {AIR, AIR_PLUS}; shipBy ≥ createdAt; client непустой | новый заказ со статусом NEW, id = `ORD-${seq}` (seq = max+1 по существующим) |
| `reserveOrder(state, orderId)` | заказ существует; status === NEW; `free(sku) ≥ qty` | `reserved += qty`; status → RESERVED |
| `shipOrder(state, orderId)` | заказ существует; status === RESERVED | `physical −= qty`; `reserved −= qty`; status → SHIPPED |
| `receiveShipment(state, shipmentId)` | поставка существует; status === PLANNED | `physical += qty`; status → RECEIVED |

Следствия (покрываются тестами): нельзя зарезервировать/отгрузить больше свободного; единица не обещается двум заказам (второй `reserveOrder` упадёт, т.к. free уменьшился); повторный резерв/отгрузка/приём — `DomainError`; отрицательные остатки невозможны.

### 3.4 Расчёт shortage и риска (`src/domain/shortage.ts`) — точные формулы

Активные заказы = статус NEW или RESERVED.

- **Shortage по SKU** = `max(0, Σ qty активных заказов NEW по SKU − free(SKU))`.
  (RESERVED уже покрыты полем reserved — не учитываются повторно.)
- **Риск опоздания** — для каждого активного заказа `o` (сортировка: shipBy ↑, приоритет HIGH>NORMAL>LOW, createdAt ↑):
  - `availableBy = free(sku) + Σ qty поставок PLANNED по sku с expectedDate ≤ o.shipBy`;
  - `demandBefore = Σ qty заказов NEW по тому же sku, стоящих раньше o в этой сортировке`;
  - если `availableBy < demandBefore + o.qty` → заказ **под риском**, `deficit = demandBefore + o.qty − availableBy`, `reason = "свободный остаток + поставки до {shipBy} не покрывают очередь заказов"`.

### 3.5 Симуляция задержки (`src/domain/delaySimulation.ts`)

`simulateDelay(state, shipmentId, days)` — **read-only**:
1. `sim = cloneState(state)` (deep clone, `JSON.parse(JSON.stringify())` или structuredClone);
2. в `sim` сдвигается `expectedDate` указанной поставки на `days` дней (days ≥ 0, целое);
3. пересчитывается `computeRisk(sim)`;
4. результат: `{ shipmentId, days, atRisk: [{orderId, sku, qty, shipBy, deficit, reason}], newlyAtRisk: [orderId...] }`, где `newlyAtRisk` — заказы, под риском в sim, но НЕ под риском в исходном state.
5. Исходный `state` не трогается (тест на deep-equal снапшота).

### 3.6 Производство (`src/domain/production.ts`)

`canProduce(state, config, sku, qty, targetDate)` — read-only, возвращает `{ possible, readyDate?, reason? }`:
1. `requiredUnits = ceil(qty / (1 − defectRate))` (брак из config);
2. **Комплектующие**: для каждого компонента BOM[sku]: `need = requiredUnits × bomQty`; если `state.components[comp] < need` → `possible=false`, reason: «не хватает комплектующих: {comp}: нужно {need}, есть {have}» (первый дефицит);
3. **Рабочее время**: `unitsPerDay = (hoursPerShift / hoursPerUnit) × shiftsPerDay`; `daysNeeded = ceil(requiredUnits / unitsPerDay)`; `readyDate = today + daysNeeded` (календарные дни); если `readyDate > targetDate` → `possible=false`, reason: «не хватает рабочего времени: нужно {daysNeeded} дн., доступно {разница} дн.»;
4. иначе `possible=true`, `readyDate`.

Параметры из `config/company.json`: `defectRate: 0.05`, `hoursPerUnit: 0.4` (сборка+проверка), `shiftsPerDay: 2`, `hoursPerShift: 8` → 40 изделий/день.

### 3.7 ИИ-аналитик

- `buildSnapshot(state, config)` → JSON-строка: `{ asOf, stock: {AIR: {physical, reserved, free}, AIR_PLUS: {...}}, components, orders (активные), shipments, shortage, risk }`.
- **Провайдеры** (`src/server/ai/provider.ts`), приоритет по env:
  1. `ANTHROPIC_API_KEY` → POST `https://api.anthropic.com/v1/messages` (model из `ANTHROPIC_MODEL`, по умолчанию `claude-sonnet-4-5`), заголовок `x-api-key`;
  2. иначе `OPENAI_API_KEY` → POST `{OPENAI_BASE_URL||https://api.openai.com/v1}/chat/completions` (Bearer, model из `OPENAI_MODEL`, по умолчанию `gpt-4o-mini`);
  3. иначе **mock-аналитик** (`mockAnalyze` в `src/domain/ai.ts`) — детерминированный ответ, вычисленный из снимка (без LLM, без заготовленных текстов-шаблонов с фиксированными цифрами).
- System prompt (RU): «Ты — аналитик склада. Отвечай строго на основе данных снимка состояния, приведённых ниже. Не выдумывай цифры. Если данных недостаточно — скажи об этом. Данные: {snapshot}». User: вопрос.
- Ответ API: `{ answer, provider: 'anthropic'|'openai'|'mock' }`.

**Mock-аналитик** — маршрутизация по ключевым словам вопроса (все цифры берутся из снимка):
- «нехватк»/«дефицит»/«shortage» → отчёт shortage по SKU;
- «риск»/«опозд» → список заказов под риском с дефицитом;
- «поставк» → сводка поставок + напоминание про симуляцию задержки;
- «производств»/«собрать» → вывод по производственной мощности (из config);
- иначе → полная сводка: остатки (physical/reserved/free), shortage, риск, ближайшие поставки.
Детерминированность: без `Date.now()` в выводе, без случайности — один и тот же (snapshot, question) → один и тот же ответ (тест).

---

## 4. Конфиг `config/company.json`

```json
{
  "company": "Air Devices Inc.",
  "skus": {
    "AIR":      { "name": "Air",      "measures": ["temperature", "humidity"] },
    "AIR_PLUS": { "name": "Air Plus", "measures": ["temperature", "humidity", "co2"] }
  },
  "bom": {
    "AIR":      { "pcb": 1, "temp_sensor": 1, "humidity_sensor": 1, "display": 1, "case": 1 },
    "AIR_PLUS": { "pcb": 1, "temp_sensor": 1, "humidity_sensor": 1, "co2_sensor": 1, "display": 1, "case": 1 }
  },
  "production": { "defectRate": 0.05, "hoursPerUnit": 0.4, "shiftsPerDay": 2, "hoursPerShift": 8 },
  "risk": { "considerIncoming": true, "priorityOrder": ["HIGH", "NORMAL", "LOW"] }
}
```

Данные компании НЕ хардкодятся в коде — только в `config/company.json` и `data/seed.json`.

---

## 5. REST API (все тела валидируются zod'ом на границе)

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/api/state` | — | `{ state, shortage, risk }` |
| POST | `/api/orders` | `{client, sku, qty, shipBy, priority?}` | созданный заказ |
| POST | `/api/orders/:id/reserve` | — | обновлённый заказ |
| POST | `/api/orders/:id/ship` | — | обновлённый заказ |
| POST | `/api/shipments/:id/receive` | — | обновлённая поставка |
| POST | `/api/simulate/delay` | `{shipmentId, days}` | отчёт симуляции (read-only) |
| POST | `/api/ai/ask` | `{question}` | `{answer, provider}` |
| POST | `/api/production/check` | `{sku, qty, targetDate}` | `{possible, readyDate?, reason?}` |

Ошибки: `DomainError` → 400 `{error: message}`; `ZodError` → 400 `{error: 'invalid input', issues}`; неизвестный id → 404. Каждая мутация → атомарное сохранение `data/seed.json` (tmp + `fs.renameSync`).

---

## 6. Пошаговый план реализации (a–h)

**Правило: после каждого шага — `npm run build` и `npm test`, ошибки чинить до зелёного.**

### Шаг 0 — Каркас проекта
- Создать: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `index.html`, пустые папки.
- **Критерий готовности**: `npm install` проходит; `npm run build` и `npm test` запускаются без ошибок (тестов пока нет — ок).

### Шаг a — Домен + типы + инварианты
- Файлы: `src/shared/types.ts`, `src/domain/state.ts`, `src/domain/invariants.ts`, `src/domain/orders.ts`, `src/domain/shipments.ts`, `src/domain/shortage.ts`; тесты `tests/invariants.test.ts`, `tests/orders.test.ts`, `tests/shipments.test.ts`, `tests/shortage.test.ts`.
- **Критерий**: все тесты §8.1–8.4 зелёные; `npm run build` зелёный; в домене нет ни одного `import` из `src/server` и никакого I/O.

### Шаг b — Сид-данные
- Файлы: `config/company.json`, `scripts/generate-seed.ts`, `data/seed.json` (сгенерированный), `scripts/import.ts` (опциональный).
- Генератор: детерминированный PRNG (mulberry32, seed=42), даты — относительно `new Date()` на момент генерации. Состав: 10–20 заказов (микс NEW/RESERVED/SHIPPED, приоритеты), 3–5 поставок (PLANNED + 1 RECEIVED), ненулевые остатки обоих SKU, комплектующие. **Обязательные сценарии в seed**:
  1. дефицит AIR: Σ NEW-заказов AIR > free(AIR);
  2. риск опоздания: заказ с shipBy раньше даты поставки, которая бы его покрыла;
  3. успешный резерв: NEW-заказ с qty ≤ free (кнопка «Резервировать» сразу работает).
- `scripts/import.ts`: читает `products.json`, `orders.json`, `stock.json`, `incoming.json` из папки `company-archive/` (путь — аргумент CLI), мапит в `data/seed.json`. Использовать ТОЛЬКО если архив появится; сейчас — заглушка с понятным сообщением.
- **Критерий**: `npm run seed` создаёт `data/seed.json`; инварианты в файле выполняются; три сценария выше присутствуют (проверить глазами + assert'ами в тесте-фиксуре).

### Шаг c — API
- Файлы: `src/shared/schemas.ts`, `src/server/store.ts`, `src/server/app.ts`, `src/server/main.ts`, `src/server/routes/*.ts`.
- **Критерий**: все 8 эндпоинтов отвечают (проверить curl); невалидный ввод → 400 (zod); мутация → `data/seed.json` обновлён атомарно; `DomainError` → 400 с причиной; `npm run build` зелёный.

### Шаг d — UI
- Файлы: `src/client/*` (все компоненты из §2), `styles.css`.
- **Критерий**: `npm run dev` → http://localhost:5173: видны остатки (physical/reserved/free) по обоим SKU; активные заказы с подсветкой shortage/риска; работают кнопки: создание заказа, резерв, отгрузка, приём поставки — UI обновляется после каждого действия (fetch `/api/state`).

### Шаг e — Симуляция задержки
- Файлы: `src/domain/delaySimulation.ts`, `src/server/routes/simulate.ts`, `src/client/components/SimulationTab.tsx`; тест `tests/delaySimulation.test.ts`.
- **Критерий**: `POST /api/simulate/delay` возвращает заказы под угрозой с причиной и дефицитом; в UI виден отчёт; `GET /api/state` до и после симуляции — идентичен (тест deep-equal, §8.5).

### Шаг f — ИИ-панель (с mock-фолбэком)
- Файлы: `src/domain/ai.ts`, `src/server/ai/provider.ts`, `src/server/routes/ai.ts`, `src/client/components/AiTab.tsx`; тест `tests/ai.mock.test.ts`.
- **Критерий**: без ключей `POST /api/ai/ask` отвечает mock'ом, цифры в ответе совпадают с текущим состоянием (проверить: изменить остаток → ответ меняется); с `ANTHROPIC_API_KEY` в `.env` — ответ от Claude; бейдж провайдера виден в UI; в коде нет заготовленных ответов.

### Шаг g — Производственный модуль
- Файлы: `src/domain/production.ts`, `src/server/routes/production.ts`, `src/client/components/ProductionTab.tsx`; тест `tests/production.test.ts`.
- **Критерий**: «можно ли собрать X единиц SKU Y к дате D» возвращает дату готовности или причину (нехватка комплектующих / рабочее время); UI показывает результат; тесты §8.6 зелёные.

### Шаг h — Тесты, README, финальная проверка
- Файлы: `tests/*` (полный набор §8), `README.md` (§7).
- **Критерий**: `npm test` зелёный; `npm run build` зелёный; все 9 пунктов Definition of Done проверены по чек-листу (§9).

---

## 7. План README.md

1. **Описание**: что моделирует приложение (склад, заказы, поставки, симуляция, ИИ-аналитик, производство).
2. **Быстрый старт**: `npm install` → `npm run dev` → http://localhost:5173 (API на :3001).
3. **Выбор стека и обоснование** (Vite+React+Express vs Next.js — §1).
4. **Архитектура**: структура папок; чистый домен; in-memory + атомарная персистентность `data/seed.json`.
5. **Где конфиг**: `config/company.json` (SKU, BOM, нормы времени, правила риска) и `data/seed.json` (данные).
6. **Подключение API-ключа**: `.env` (скопировать из `.env.example`); приоритет: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` (+`OPENAI_BASE_URL`, `OPENAI_MODEL`) → mock; без ключей работает mock-аналитик.
7. **Добавление данных компании**: `npm run import` (если есть архив: products/orders/stock/incoming.json) или `npm run seed` для генерации; редактирование `data/seed.json` вручную.
8. **Чтение отчёта симуляции**: поля `atRisk` (orderId, sku, qty, shipBy, deficit, reason) и `newlyAtRisk`; вкладка «Симуляция».
9. **Справочник API**: таблица эндпоинтов (§5).
10. **Тесты**: `npm test`, что покрыто.
11. **Ограничения MVP** (что осталось за рамками):
    - нет аутентификации и многопользовательской конкурентности (in-memory, один процесс);
    - производство — только read-only проверка «можно ли», без фактического списания комплектующих;
    - один склад, два SKU (расширение — через config);
    - mock-аналитик — эвристика по ключевым словам, не LLM;
    - нет истории операций/аудита;
    - персистентность — один JSON-файл (не БД).

---

## 8. Список тестов (vitest)

### 8.1 `tests/invariants.test.ts`
- после любой последовательности действий `assertInvariants` не падает: physical ≥ 0, reserved ≥ 0, reserved ≤ physical;
- `free = physical − reserved` согласован во всех состояниях.

### 8.2 `tests/orders.test.ts`
- создание: qty ≤ 0 → DomainError; невалидный sku → DomainError; shipBy < createdAt → DomainError;
- резерв: NEW → RESERVED, reserved увеличен на qty;
- резерв больше свободного → DomainError;
- **двойное резервирование**: free = 5, два заказа по 3 → первый резерв ок, второй → DomainError (одна единица не обещается двум заказам);
- повторный резерв того же заказа → DomainError;
- отгрузка: только из RESERVED; physical и reserved уменьшены; повторная отгрузка → DomainError;
- отгрузка NEW-заказа → DomainError.

### 8.3 `tests/shipments.test.ts`
- приём PLANNED → physical += qty, status RECEIVED;
- повторный приём → DomainError;
- приём несуществующей поставки → DomainError.

### 8.4 `tests/shortage.test.ts`
- shortage = max(0, Σ NEW − free) на фиксированном состоянии;
- риск: заказ под риском, когда free + поставки до shipBy < очередь;
- риск исчезает, когда поставка приходит до shipBy;
- RESERVED-заказы не учитываются в shortage повторно.

### 8.5 `tests/delaySimulation.test.ts`
- **снапшот**: `deepEqual(state, cloneState(state))` до и после `simulateDelay` — исходное состояние не изменилось;
- задержка поставки N дней → в отчёте заказ под риском с `deficit > 0` и причиной;
- `days = 0` → `newlyAtRisk` пуст;
- неизвестный `shipmentId` → DomainError;
- `days < 0` → DomainError.

### 8.6 `tests/production.test.ts`
- достаточно комплектующих и времени → `possible=true`, `readyDate ≤ targetDate`;
- нехватка компонента → `possible=false`, reason содержит компонент и цифры «нужно/есть»;
- нехватка рабочего времени → `possible=false`, reason про время;
- брак: `requiredUnits = ceil(qty / 0.95)` (проверить через влияние на дефицит компонентов).

### 8.7 `tests/ai.mock.test.ts`
- mock-ответ содержит актуальные цифры из снимка (free, shortage) — меняем состояние → меняется ответ;
- детерминированность: два вызова с одинаковым (snapshot, question) → одинаковый ответ;
- в ответе нет цифр, которых нет в снимке (проверка по ключевым словам «нехватк»/«риск»).

---

## 9. Чек-лист Definition of Done (финальная проверка)

1. `npm install && npm run dev` — приложение поднимается без ошибок. ☐
2. Видны остатки, резервы и свободный остаток по обоим SKU. ☐
3. Видны активные заказы, нехватка и риск опоздания. ☐
4. Работают: создание заказа, резерв, отгрузка, приём поставки. ☐
5. Невозможны отрицательные остатки и двойное резервирование — тесты доказывают. ☐
6. Симуляция задержки не меняет исходное состояние (тест на снапшот). ☐
7. ИИ-панель отвечает на вопросы по текущему JSON-снимку; без ключа — mock-аналитик. ☐
8. `npm test` — зелёный. ☐
9. README описывает запуск и ограничения. ☐

---

## 10. Чего НЕ делать (контроль на каждом шаге)

- Не подключаться к реальным системам предприятия.
- Не использовать заранее написанные ответы ИИ (mock вычисляет цифры из данных).
- Не хранить physical и free как два независимых поля (free — только функция).
- Не мутировать состояние в симуляции задержки (только deep clone).
- Не добавлять тяжёлые зависимости без необходимости (список зависимостей зафиксирован в §2).