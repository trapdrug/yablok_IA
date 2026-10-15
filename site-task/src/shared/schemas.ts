import { z } from 'zod';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const createOrderSchema = z.object({
  client: z.string().min(1),
  sku: z.enum(['AIR', 'AIR_PLUS']),
  qty: z.number().int().positive(),
  createdAt: dateSchema,
  shipBy: dateSchema,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
});

export const delaySimulationSchema = z.object({
  shipmentId: z.string().min(1),
  days: z.number().int().nonnegative(),
});

export const aiAskSchema = z.object({
  question: z.string().min(1),
});

export const productionCheckSchema = z.object({
  sku: z.enum(['AIR', 'AIR_PLUS']),
  qty: z.number().int().positive(),
  targetDate: dateSchema,
});