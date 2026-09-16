# syntax=docker/dockerfile:1
# Dockerfile para apps/kiosk — build 100% estático (output: "export", ver
# next.config.ts), sin backend propio (ADR: "cero lógica de negocio").
# Contexto de build requerido: la RAÍZ del repo (mismo motivo que el
# Dockerfile de apps/web-admin: necesita el package-lock.json raíz para
# resolver los workspaces con `npm ci`).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/kiosk/package.json apps/kiosk/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
COPY packages/design-system/package.json packages/design-system/package.json
COPY packages/theming/package.json packages/theming/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY turbo.json turbo.json
COPY apps/kiosk apps/kiosk
# El kiosco importa código fuente (no solo tipos) de estos dos paquetes —
# arriba solo se copió su package.json (para que npm ci resuelva el
# workspace), acá se copia el código real que Turbopack necesita compilar.
COPY packages/theming packages/theming
COPY packages/ui packages/ui

# Fija en build time (decisión de esta sesión) — un build por entorno
# (staging/producción), no por Organización: todas comparten la misma
# instancia de apps/web-admin (es multi-tenant).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "NEXT_PUBLIC_API_URL es obligatorio" && exit 1)

RUN npx turbo run build --filter=kiosk

# ---- runner: sirve el export estático con un servidor mínimo -------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /repo/apps/kiosk/out ./out

EXPOSE 3000
CMD ["serve", "-s", "out", "-l", "3000"]
