# Multi-stage Dockerfile for StreamVerse API
# Debian (glibc) base, not Alpine: Prisma's query engine segfaulted (exit 139) on the Alpine/musl image.
# Stage 1: build — installs all deps, generates Prisma client, compiles TypeScript
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Prisma's engines link against OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Run Prisma's query engine as a separate process instead of loading it into Node: a crash in it then shows up as
# an error message instead of killing the whole server with a segfault (exit 139).
ENV PRISMA_CLIENT_ENGINE_TYPE=binary

COPY package*.json ./
# --omit=optional skips msgpackr-extract (a native BullMQ speed-up with known segfaults); it falls back to plain JS.
RUN npm ci --ignore-scripts --omit=optional

COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: runner — minimal production image, non-root user
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd --system appgroup && useradd --system --gid appgroup appuser

# Copy only what the running server needs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

USER appuser

EXPOSE 4000

# Lightweight liveness probe (node is always present; slim has no wget/curl). PORT is set by the host (Render).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations before starting, so a fresh database gets its tables.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
