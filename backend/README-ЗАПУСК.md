# ЗАПУСК (Windows)

1. Установить зависимости:
```
python -m pip install -r backend/requirements.txt
```
2. Запуск API (из корня `15-16`):
```
python -m uvicorn backend.app:app --port 8000
```
3. Swagger: http://localhost:8000/docs
4. Health: http://localhost:8000/api/health
5. Тесты:
```
python -m pytest backend/tests/test_engine.py -q
```

База: `backend/twin.db` (SQLite, пароль не нужен — по ТЗ).
Postgres установлен у заказчика, но по ТЗ используется SQLite; пароль 1234567890 зафиксирован на случай миграции.

ENV: `backend/.env` содержит AI_FUNPAY_BASE_URL и AI_FUNPAY_KEY.

Основные endpoints:
- GET /api/health, /api/snapshot, /api/orders?status=active, /api/shipments
- POST /api/orders, /api/orders/{id}/reserve, /api/orders/{id}/ship
- POST /api/shipments/{id}/receive
- POST /api/scenarios/delay
- GET /api/production/status; POST /api/production/plan|start
- POST /api/ai/ask
- POST /api/admin/reset?fixture=simple|extended; POST /api/admin/now

Время: `scenario_now=2026-11-02T09:00+03:00`, дату ПК не используем.
