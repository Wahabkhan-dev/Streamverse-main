# Multi-stage Dockerfile for StreamVerse API
# Stage 1: build — installs all deps, generates Prisma client, compiles TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

# Prisma's engines link against OpenSSL; without it Prisma picks the wrong engine and the server segfaults (exit 139).
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: runner — minimal production image, non-root user
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl && addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only what the running server needs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

USER appuser

EXPOSE 4000

# Lightweight liveness probe; wget is available in alpine. PORT is set by the host (Render), else the API default.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-4000}/health" || exit 1

# Apply pending migrations before starting, so a fresh database gets its tables.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
