# Firecode × ЯблокИИ — двойник склада

Учебный цифровой двойник склада датчиков air и air plus: остатки и бронь,
заказы, поставки в пути, пробный расчёт задержки, производство и два
ИИ-помощника (аналитик и консультант) на чат-модели.

## Быстрый старт (Windows)

```powershell
# Backend (:8000)
python -m pip install -r backend/requirements.txt
copy backend\.env.example backend\.env   # без ключей ИИ работает на встроенных ответах
python -m uvicorn backend.app:app --port 8000 --host 0.0.0.0

# Frontend (:5173, второе окно)
cd frontend
npm i
npm run dev
```

- Сайт: http://localhost:5173
- Swagger: http://localhost:8000/docs
- Тесты: `python -m pytest backend/tests/test_engine.py -q`

Подробно: [README-ZAPUSK.md](README-ZAPUSK.md), [СБОРКА-И-ДЕМО.md](СБОРКА-И-ДЕМО.md).

Время в программе учебное: `scenario_now=2026-11-02T09:00+03:00`.
