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
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
COPY packages/design-system/package.json packages/design-system/package.json
COPY packages/theming/package.json packages/theming/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

# ---- builder: genera el cliente Prisma y compila con Turborepo -----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

RUN cd packages/db && npx prisma generate
RUN npx turbo run build --filter=web-admin

# ---- runner: imagen final mínima, corre el server.js standalone ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=America/Caracas

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Salida "standalone" de Next.js: server.js + node_modules mínimos ya
# resueltos (ver output: "standalone" en apps/web-admin/next.config.ts).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-admin/public ./apps/web-admin/public

# "Toolkit" de migraciones — el standalone de arriba NO sirve para esto:
# le falta el Prisma CLI, dotenv, tsx, etc. (nada de eso lo importa el
# código de la app en runtime, así que el tracing automático de Next.js no
# los arrastra). En vez de reinstalar/descargar nada en cada arranque
# (probado y descartado: falla por resolución de módulos de
# prisma7.config.ts, que a su vez importa "prisma/config" y "dotenv"),
# se copia el node_modules COMPLETO del build — pesa más, pero es
# exactamente el mismo árbol ya resuelto por `npm ci`, sin sorpresas.
# Así docker-entrypoint.sh puede correr `prisma migrate deploy` solo, sin
# que nadie tenga que entrar a la consola del contenedor a mano.
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules ./migrate-toolkit/node_modules
COPY --from=builder --chown=nextjs:nodejs /repo/packages/db ./migrate-toolkit/packages/db
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
