# syntax=docker/dockerfile:1
# Vista previa en navegador de apps/vitrina (export estático, ver next.config.ts) para probar en EasyPanel.
# El APK NO usa este Dockerfile: lleva el export dentro del bundle (apps/vitrina-tv).
# Contexto de build requerido: la RAÍZ del repo (necesita el package-lock.json raíz para `npm ci`).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/vitrina/package.json apps/vitrina/package.json
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
COPY apps/vitrina apps/vitrina
# La vitrina importa código fuente de estos dos paquetes (ADR-002): arriba solo se copió su package.json.
COPY packages/domain packages/domain
COPY packages/theming packages/theming

RUN npx turbo run build --filter=vitrina

# ---- runner: sirve el export estático y escribe vitrina-config.json al arrancar -------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV TZ=America/Caracas

RUN npm install -g serve@14

COPY --from=builder /repo/apps/vitrina/out ./out
COPY apps/vitrina/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
