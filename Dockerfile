# Multi-Stage Production Dockerfile for NEXORA OMS Engine

# Stage 1: Dependency Builder
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Set proper ownership to non-root user
USER nodejs

EXPOSE 5000

CMD ["node", "src/server.js"]
