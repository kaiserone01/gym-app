# Handoff — gym-app (Adrenalina Xtreme Gym)

Última actualización: 2026-09-18.

**El checklist vivo del proyecto es [`docs/ROADMAP.md`](../ROADMAP.md)** — este archivo es solo el punto de entrada para retomar: qué se hizo, qué falta decidir, y cómo levantar el entorno de nuevo. No dupliques información del roadmap acá; si el roadmap y este archivo alguna vez no coinciden, el roadmap manda.

## Estado en una frase

El panel admin (`apps/web-admin`) y el kiosco físico (`apps/kiosk`) están funcionales y probados contra la base de datos real por el usuario, con el flujo completo de alta de miembro (foto, plan, entrenador, primer pago automático), pantallas reales de Miembros/Pagos/Planes, y el módulo de Caja rediseñado con un flujo real de **Turnos por cajero/sucursal** (apertura con fondo inicial, egresos, arqueo por método al cierre) que reemplaza el cierre diario global anterior. Nada se desplegó todavía a producción (Docker/EasyPanel) — todo el trabajo hasta ahora fue en local.

## Qué falta — ver `docs/ROADMAP.md`

Las secciones relevantes ahora mismo:
- **Plan 13 — Turnos de Caja, Arqueo y Egresos** — recién completado (build y `tsc` verificados); falta la prueba manual en el navegador contra la base real, y dos mini-pendientes de UI (selector de sucursal para un DUEÑO multi-sede, botón de anulación de pago).
- **🟡 Funcionalidad core pendiente** — incluye la tasa BCV real sin conectar (hoy fija en 850), rotación de `apiKey`, matriz de permisos, y la decisión abierta sobre `RegistrarPago` contra un miembro inactivo.
- **Plan 11 — Tema visual** — completo, con el theming dinámico por Organización explícitamente diferido.
- **Ajustes ad-hoc — Nuevo Miembro / Registrar Pago** — toda la iteración reciente (planes preestablecidos, foto, entrenador, ticket de confirmación, pago automático al alta, switch activo/inactivo, historial de pagos en subpágina).
- **Deploy real** — todavía no arrancó (Fase E). Ojo con `apps/web-admin/public/uploads/miembros` (fotos de perfil): necesita un volumen persistente en Docker o se pierden en cada rebuild.

## Cómo retomar en local

Tres cosas cambian según qué se haya modificado desde el último `git pull` — no siempre hace falta todo:

| Cambió | Correr |
|---|---|
| Solo código | Nada extra, directo `npm run dev` |
| `package.json` (deps nuevas) | `npm install` |
| `schema.prisma` (migración nueva) | `cd packages/db && npx prisma migrate dev` (aplica la migración Y regenera el cliente) |

Si después de una migración el cliente de Prisma no refleja el cambio nuevo (error `Unknown argument` en un campo que sabés que agregaste), no es la migración — es el caché de Turbopack. Solución: `Remove-Item -Recurse -Force apps\web-admin\.next` (Windows) o `rm -rf apps/web-admin/.next` y volver a levantar.

Para levantar todo: `npm run dev` desde la raíz (Turborepo levanta `web-admin` en `:3000` y `kiosk` en `:3001` juntos). El kiosco necesita `apps/kiosk/.env.local` con `NEXT_PUBLIC_API_URL=http://localhost:3000` (no se versiona, hay que crearlo a mano en cada máquina nueva).

Para vaciar miembros de prueba sin tocar el resto de los catálogos: `npm run db:limpiar-miembros --workspace packages/db`.

## Pendientes chicos sin resolver

- `cookies.txt` suelto en la raíz del repo (de una prueba de otra sesión) — no se tocó, esperando confirmación del usuario para borrarlo.
- El `.env` de la raíz tiene la `DATABASE_URL` real de Postgres — si alguna vez se comparte en un chat o log por error, rotar la contraseña.

## Convención de trabajo en este repo

Varias sesiones de Claude trabajan sobre este repo en paralelo, todas pusheando directo a `main` (instrucción explícita del usuario). Antes de empezar cualquier tarea nueva: `git fetch origin main` + fast-forward, para no pisar ni duplicar trabajo de otra sesión. Los cambios de esquema (`schema.prisma`) se escriben a mano (migración + código) porque el entorno de ejecución de Claude normalmente no tiene acceso directo a la base de datos real — el usuario aplica la migración en su máquina.

Los planes grandes se documentan como `docs/superpowers/plans/YYYY-MM-DD-<nombre>.md` antes de ejecutarse; los ajustes chicos e iterativos (como la mayoría de "Ajustes ad-hoc" del roadmap) se hacen directo, commit por commit, sin plan escrito — está bien, pero hay que asegurarse de que terminen reflejados en `docs/ROADMAP.md`.
