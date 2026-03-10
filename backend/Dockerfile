# =============================================================================
# ClusterGate Backend - Multi-stage Dockerfile
# =============================================================================

# ---------------------------------------------------------------------------
# Base stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------
# Development stage
# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Builder stage
# ---------------------------------------------------------------------------
FROM base AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Production stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S clustergate -u 1001

COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/prisma/schema.prisma ./prisma/schema.prisma

RUN chown -R clustergate:nodejs /app
USER clustergate

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

CMD ["node", "dist/app.js"]
