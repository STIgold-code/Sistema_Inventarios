# Web (Next.js) — build desde la raíz del monorepo pnpm
FROM node:22-slim

RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_API_URL debe estar en tiempo de build (Next la embebe)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @bm/tipos build \
 && pnpm --filter @bm/contratos build \
 && pnpm --filter @bm/web build

WORKDIR /app/apps/web
# next start usa el PORT que inyecta Railway
CMD ["sh", "-c", "pnpm start"]
