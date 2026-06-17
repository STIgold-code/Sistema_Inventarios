# API (NestJS) — build desde la raíz del monorepo pnpm
FROM node:22-slim

# Prisma necesita openssl
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bm/tipos build \
 && pnpm --filter @bm/contratos build \
 && pnpm --filter @bm/api db:generate \
 && pnpm --filter @bm/api build

WORKDIR /app/apps/api
# Aplica migraciones y arranca (PORT lo inyecta Railway)
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
