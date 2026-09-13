# syntax=docker/dockerfile:1
# Dockerfile para gym-app (monorepo npm workspaces + Turborepo).
# Contexto de build requerido: la RAÍZ del repo (no apps/web-admin/),
# porque necesita package.json/package-lock.json raíz para resolver
# los workspaces con `npm ci`.

ARG NODE_VERSION=22-alpine

# ---- deps: instala TODAS las dependencias del monorepo -------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

# ---- builder: genera el cliente Prisma y compila con Turborepo -----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

RUN npx prisma generate --schema apps/web-admin/prisma/schema.prisma
RUN npx turbo run build --filter=web-admin

# ---- runner: imagen final mínima, corre el server.js standalone ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Salida "standalone" de Next.js: server.js + node_modules mínimos ya
# resueltos (ver output: "standalone" en apps/web-admin/next.config.ts).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-admin/public ./apps/web-admin/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web-admin/server.js"]
