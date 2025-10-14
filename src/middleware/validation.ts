import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues.map((err: z.ZodIssue) => ({
        field: err.path.join('.'),
        message: err.message,
        value: err.input,
      }));
      
      logger.warn('Input validation failed', { 
        errors: fieldErrors,
        input: typeof input === 'object' ? JSON.stringify(input) : input 
      });
      
      throw new ValidationError(
        `Validation failed: ${fieldErrors.map((e: any) => `${e.field}: ${e.message}`).join(', ')}`,
        fieldErrors[0]?.field || 'unknown',
        fieldErrors[0]?.value
      );
    }
    throw error;
  }
}

export const masterDataSchema = z.object({
  workcenters: z.array(z.object({
    name: z.string().min(1, 'Workcenter name is required'),
    setupTimeMins: z.number().int().min(0).optional(),
    batchSize: z.number().int().min(1).optional(),
  })),
  parts: z.array(z.object({
    name: z.string().min(1, 'Part name is required'),
    leadTimeMins: z.number().int().positive('Lead time must be positive'),
    workcenterName: z.string().min(1, 'Workcenter name is required'),
    setupTimeMins: z.number().int().min(0).optional(),
  })),
  vehicle: z.object({
    sku: z.string().min(1, 'Vehicle SKU is required'),
    bom: z.array(z.object({
      partName: z.string().min(1, 'Part name is required'),
      quantity: z.number().int().positive('Quantity must be positive'),
    })),
  }),
});

export const delayEventSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  partId: z.string().min(1, 'Part ID is required'),
  unitIndex: z.number().int().min(0, 'Unit index must be non-negative'),
  delayMinutes: z.number().positive('Delay must be positive'),
  reason: z.string().min(1, 'Reason is required'),
});
