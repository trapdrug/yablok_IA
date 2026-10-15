import express from 'express';
import { z } from 'zod';
import { store } from './store';
import { createOrder, reserveOrder, shipOrder } from '../domain/orders';
import { receiveShipment } from '../domain/shipments';
import { computeRisk, computeShortage } from '../domain/shortage';
import { simulateDelay } from '../domain/delaySimulation';
import { canProduce } from '../domain/production';
import { buildSnapshot } from '../domain/ai';
import { DomainError, NotFoundError } from '../domain/invariants';
import { loadCompanyConfig } from './config';
import { askAi } from './ai/provider';
import {
  aiAskSchema,
  createOrderSchema,
  delaySimulationSchema,
  productionCheckSchema,
} from '../shared/schemas';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Снимок склада, заказов, поставок, нехватки и рисков
  app.get('/api/state', (_req, res) => {
    const state = store.getState();
    res.json({ state, shortage: computeShortage(state), risk: computeRisk(state) });
  });

  app.post('/api/orders', (req, res) => {
    try {
      const input = createOrderSchema.parse(req.body);
      const next = createOrder(store.getState(), input);
      store.update(next);
      res.status(201).json(next.orders[next.orders.length - 1]);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/orders/:id/reserve', (req, res) => {
    try {
      const next = reserveOrder(store.getState(), req.params.id);
      store.update(next);
      res.json(next.orders.find((o) => o.id === req.params.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/orders/:id/ship', (req, res) => {
    try {
      const next = shipOrder(store.getState(), req.params.id);
      store.update(next);
      res.json(next.orders.find((o) => o.id === req.params.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/shipments/:id/receive', (req, res) => {
    try {
      const next = receiveShipment(store.getState(), req.params.id);
      store.update(next);
      res.json(next.shipments.find((s) => s.id === req.params.id));
    } catch (err) {
      handleError(res, err);
    }
  });

  // Read-only симуляция задержки поставки
  app.post('/api/simulate/delay', (req, res) => {
    try {
      const input = delaySimulationSchema.parse(req.body);
      const report = simulateDelay(store.getState(), input.shipmentId, input.days);
      res.json(report);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/ai/ask', async (req, res) => {
    try {
      const input = aiAskSchema.parse(req.body);
      const snapshot = buildSnapshot(store.getState());
      const result = await askAi(input.question, snapshot);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/production/check', (req, res) => {
    try {
      const input = productionCheckSchema.parse(req.body);
      const config = loadCompanyConfig();
      const result = canProduce(
        store.getState(),
        input.sku,
        input.qty,
        input.targetDate,
        config,
      );
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  return app;
}

function handleError(res: express.Response, err: unknown): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
  } else if (err instanceof DomainError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'validation failed', details: err.issues });
  } else {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
}