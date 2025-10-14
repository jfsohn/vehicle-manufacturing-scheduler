"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delayEventSchema = exports.masterDataSchema = void 0;
exports.validateInput = validateInput;
const zod_1 = require("zod");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
function validateInput(schema, input) {
    try {
        return schema.parse(input);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const fieldErrors = error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
                value: err.input,
            }));
            logger_1.logger.warn('Input validation failed', {
                errors: fieldErrors,
                input: typeof input === 'object' ? JSON.stringify(input) : input
            });
            throw new errors_1.ValidationError(`Validation failed: ${fieldErrors.map((e) => `${e.field}: ${e.message}`).join(', ')}`, fieldErrors[0]?.field || 'unknown', fieldErrors[0]?.value);
        }
        throw error;
    }
}
exports.masterDataSchema = zod_1.z.object({
    workcenters: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1, 'Workcenter name is required'),
        setupTimeMins: zod_1.z.number().int().min(0).optional(),
        batchSize: zod_1.z.number().int().min(1).optional(),
    })),
    parts: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1, 'Part name is required'),
        leadTimeMins: zod_1.z.number().int().positive('Lead time must be positive'),
        workcenterName: zod_1.z.string().min(1, 'Workcenter name is required'),
        setupTimeMins: zod_1.z.number().int().min(0).optional(),
    })),
    vehicle: zod_1.z.object({
        sku: zod_1.z.string().min(1, 'Vehicle SKU is required'),
        bom: zod_1.z.array(zod_1.z.object({
            partName: zod_1.z.string().min(1, 'Part name is required'),
            quantity: zod_1.z.number().int().positive('Quantity must be positive'),
        })),
    }),
});
exports.delayEventSchema = zod_1.z.object({
    orderId: zod_1.z.string().min(1, 'Order ID is required'),
    partId: zod_1.z.string().min(1, 'Part ID is required'),
    unitIndex: zod_1.z.number().int().min(0, 'Unit index must be non-negative'),
    delayMinutes: zod_1.z.number().positive('Delay must be positive'),
    reason: zod_1.z.string().min(1, 'Reason is required'),
});
