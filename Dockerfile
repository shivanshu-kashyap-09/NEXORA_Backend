# Multi-Stage Production Dockerfile for NEXORA OMS Engine

# Stage 1: Dependency Builder
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Set proper ownership to non-root user
USER nodejs

EXPOSE 5000

# Docker Healthcheck against Liveness Probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

CMD ["node", "src/server.js"]
