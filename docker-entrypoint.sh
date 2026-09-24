#!/bin/sh
# Corre las migraciones de Prisma pendientes contra la base real ANTES de
# arrancar el server — así ningún deploy futuro necesita que alguien entre
# a la consola del contenedor a correr `prisma migrate deploy` a mano (ver
# handoff.md, caso real: la migración de la frecuencia "Diario"). Usa el
# Prisma CLI ya instalado en ./migrate-toolkit (ver Dockerfile) — nada se
# descarga en tiempo de arranque. `migrate deploy` es idempotente: si no
# hay migraciones pendientes, no hace nada y no toca datos existentes.
set -e

(cd migrate-toolkit/packages/db && ../../node_modules/.bin/prisma migrate deploy)

exec node apps/web-admin/server.js
