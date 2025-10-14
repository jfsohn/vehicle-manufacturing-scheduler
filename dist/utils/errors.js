"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueueError = exports.DatabaseError = exports.ValidationError = exports.SchedulingError = void 0;
exports.isRetryableError = isRetryableError;
class SchedulingError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'SchedulingError';
    }
}
exports.SchedulingError = SchedulingError;
class ValidationError extends Error {
    constructor(message, field, value) {
        super(message);
        this.field = field;
        this.value = value;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class DatabaseError extends Error {
    constructor(message, operation, originalError) {
        super(message);
        this.operation = operation;
        this.originalError = originalError;
        this.name = 'DatabaseError';
    }
}
exports.DatabaseError = DatabaseError;
class JobQueueError extends Error {
    constructor(message, jobId, originalError) {
        super(message);
        this.jobId = jobId;
        this.originalError = originalError;
        this.name = 'JobQueueError';
    }
}
exports.JobQueueError = JobQueueError;
function isRetryableError(error) {
    if (error instanceof JobQueueError) {
        return true;
    }
    if (error instanceof DatabaseError) {
        return error.operation === 'connect';
    }
    return false;
}
