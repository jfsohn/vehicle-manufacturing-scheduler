export class SchedulingError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'SchedulingError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field: string, public value?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public operation: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class JobQueueError extends Error {
  constructor(message: string, public jobId?: string, public originalError?: Error) {
    super(message);
    this.name = 'JobQueueError';
  }
}

export function isRetryableError(error: Error): boolean {
  if (error instanceof JobQueueError) {
    return true;
  }
  if (error instanceof DatabaseError) {
    return error.operation === 'connect';
  }
  return false;
}
