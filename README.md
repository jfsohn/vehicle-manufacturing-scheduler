# Manufacturing Scheduler Service

A small backend service that schedules manufacturing for a single vehicle order and exposes results via a GraphQL API. Focuses on correctness, clarity, and testability.

## Stack
- TypeScript (Node.js)
- GraphQL (Apollo Server)
- Prisma ORM + SQLite
- Jest

## Why SQLite + Prisma?
- SQLite keeps setup simple and is sufficient for a single-order, single-node scenario.
- Prisma provides a strong schema, migrations, and type-safe access.
- Tradeoffs: SQLite is single-writer and not ideal for horizontal scaling. For production, Postgres would be preferred, but schema and code remain portable.

## Domain
- Workcenter: serial capacity of 1.
- Part: lead time per unit, bound to a Workcenter.
- Vehicle: has BOM of Part types and quantities.
- Order: references a Vehicle.
- Schedule: computed per unit with start and end times.

## Scheduling Algorithm (Just-In-Time Backward Scheduling)
- Groups BOM by workcenter
- Computes bottleneck duration across workcenters
- Backward schedules units per workcenter in LPT order toward a common completion time
- Enforces serial capacity and minimizes wait at integration

## Getting Started

### Local
```bash
npm install
npm run prisma:migrate
npm run dev
```
Server starts at http://localhost:4000

### With Redis (for async jobs)
Start Redis locally, then run the server:
```bash
redis-server
npm run dev
```

### Docker
Use docker-compose for a ready-to-run stack (API + Redis):
```bash
docker-compose up --build
```
GraphQL: http://localhost:4000

## GraphQL API (essential operations)
- upsertMasterData(input: MasterUpsertInput!): ID
- submitOrder(vehicleSku: String!): ID
- runScheduling(orderId: ID!, slackTolerancePercent?: Int): Boolean
- runSchedulingAsync(orderId: ID!, slackTolerancePercent?: Int): ID
- schedule(orderId: ID!): [ScheduledUnit!]
- jobStatus(jobId: ID!): JobStatusInfo
- ganttChart(orderId: ID!): String

## Testing
```bash
npm run prisma:migrate
npm test
```

### Covered Cases
- Alignment across workcenters
- Serial capacity on same workcenter
- Very long lead time bottleneck
- API flow: upsert → submit → schedule → query

## Design Notes & Tradeoffs
- Algorithm favors correctness and clarity; LPT heuristic is simple and effective under serial capacity.
- For more optimal balancing, interleaving by proportional loads per workcenter could reduce idle time.
- Data model creates `Schedule` rows per unit, which simplifies querying and Gantt-like visualization.
- All logic is layered: domain scheduler, repository for persistence, GraphQL for I/O.

## Configuration
`src/config/environment.ts` centralizes configuration.

Environment variables:
- DATABASE_URL (default: file:./dev.db)
- REDIS_HOST (default: localhost)
- REDIS_PORT (default: 6379)
- PORT (default: 4000)
- NODE_ENV (default: development)
- DEFAULT_SLACK_TOLERANCE (default: 5)
- MAX_CONCURRENT_JOBS (default: 3)

## Logging
`src/utils/logger.ts` provides structured logs (ERROR, WARN, INFO, DEBUG). Defaults: DEBUG (dev), INFO (prod).

## Validation
Zod schemas in `src/middleware/validation.ts` validate GraphQL inputs.

## Error Handling
Error types in `src/utils/errors.ts`: `SchedulingError`, `ValidationError`, `DatabaseError`, `JobQueueError`.

## Features
- Async job execution (BullMQ + Redis) with status and retries
- Rescheduling on delays
- Slack tolerance
- Setup times and batch/pipeline modeling
- Multi-order planning
- ASCII Gantt chart
- Job status and monitoring
