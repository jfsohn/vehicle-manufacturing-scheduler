export type Identifier = string;

export interface Workcenter {
  id: Identifier;
  name: string;
  setupTimeMins?: number; // setup time between different part types
  batchSize?: number; // optional batching for efficiency
}

export interface Part {
  id: Identifier;
  name: string;
  leadTimeMins: number; // duration to produce one unit
  workcenterId: Identifier;
  setupTimeMins?: number; // part-specific setup time
}

export interface BomItem {
  partId: Identifier;
  quantity: number;
}

export interface Vehicle {
  id: Identifier;
  sku: string;
  bom: BomItem[];
}

export interface Order {
  id: Identifier;
  vehicleId: Identifier;
  status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED';
  priority?: number; // for multi-order planning
  createdAt: Date;
  targetCompletion?: Date;
}

export interface ScheduledUnit {
  partId: Identifier;
  unitIndex: number;
  workcenterId: Identifier;
  startTime: Date;
  endTime: Date;
  originalStartTime?: Date; // for rescheduling tracking
  originalEndTime?: Date;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';
}

export interface ScheduleResult {
  orderId: Identifier;
  units: ScheduledUnit[];
  targetCompletion: Date;
  slackTolerancePercent?: number;
}

export interface JobStatus {
  jobId: string;
  orderId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface DelayEvent {
  orderId: Identifier;
  partId: Identifier;
  unitIndex: number;
  delayMinutes: number;
  reason: string;
  occurredAt: Date;
}

export interface MultiOrderPlan {
  orders: Order[];
  conflicts: WorkcenterConflict[];
  totalDuration: number;
  optimized: boolean;
}

export interface WorkcenterConflict {
  workcenterId: Identifier;
  orderIds: Identifier[];
  timeRange: { start: Date; end: Date };
  severity: 'WARNING' | 'CRITICAL';
}
