# Multi-stage build for production-ready manufacturing scheduler
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 scheduler

# Copy the built application
COPY --from=builder --chown=scheduler:nodejs /app/dist ./dist
COPY --from=builder --chown=scheduler:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=scheduler:nodejs /app/package.json ./package.json
COPY --from=builder --chown=scheduler:nodejs /app/prisma ./prisma

# Create data directory for SQLite
RUN mkdir -p /app/data && chown scheduler:nodejs /app/data

USER scheduler

EXPOSE 4000

ENV PORT=4000
ENV DATABASE_URL="file:/app/data/production.db"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/server.js"]
