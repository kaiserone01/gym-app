# Roadmap — gym-app

Checklist vivo del proyecto. Se actualiza marcando `- [x]` a medida que se completa cada ítem — no se reescribe desde cero cada vez, solo se marca/agrega.

---

## ✅ Completado

### Plan 1 — Monorepo Turborepo
- [x] `apps/web-admin` + `packages/*` (Turborepo, npm workspaces)
- [x] `Dockerfile` de producción para Easypanel

### Plan 2 — Schema SaaS multi-tenant
- [x] `Organizacion → Sucursal → Miembro` (reemplaza el modelo `Gym` single-tenant)
- [x] `Plan` / `Suscripcion` / `PlanSucursalAcceso` (acceso multi-sucursal por membresía)
- [x] `UsuarioAdmin.rol` (enum `RolUsuario`: DUENO/GERENTE/RECEPCION/ENTRENADOR)
- [x] `RegistroAuditoria`, `TasaCambio`, `TemaOrganizacion` (modelos creados, sin consumidores todavía — ver pendientes)
- [x] Idempotencia de `/api/checkin` (ventana de 2 min)

### Plan 3 — Dominio hexagonal (check-in + autorización)
- [x] `packages/domain`: entidades, 7 puertos, casos de uso `RegistrarCheckIn`/`ValidarAccesoSucursalPorPlan`/`CrearUsuarioAdmin`, `AuthorizationService`
- [x] `packages/infrastructure`: adaptadores Prisma + `KioskTokenValidator`
- [x] Autenticación del kiosco por `apiKey` de `Sucursal` (header `X-Kiosk-Api-Key`) — cierra el hallazgo 🔴 crítico del ADR (`sucursalId` sin validar)
- [x] `estadoAlMomento` migrado a `Suscripcion`/`Plan` (ya no depende de `Miembro.fechaVencimiento`)
- [x] `app/api/checkin/route.ts` como handler delgado
- [x] Enforcement de "crear `UsuarioAdmin` es exclusivo de `DUENO`" (`AuthorizationService`, verificado con script manual)
- [x] Todo verificado extremo a extremo contra la base de datos real

### Plan 4 — Login/sesión del panel admin (en curso)
- [x] Modelo `Sesion` (tabla nueva, código de las Tareas 1–9)
- [x] `IniciarSesion`/`CerrarSesion`/`ValidarSesion` + `BcryptPasswordHasher`/`PrismaSesionRepository`
- [x] Rutas `/api/auth/login`, `/api/auth/logout`, `/api/usuarios` (protegida) + página `/login`
- [x] Build/lint verificados sin DB
- [ ] Tarea 10: migrar + probar contra la base real (pendiente, requiere red del usuario)

---

## 🔴 Bloqueadores antes de exponer nada a un usuario real

- [ ] **Login/sesión del panel admin** — código completo (Plan 4, Tareas 1-9), falta la Tarea 10 (migrar + probar contra la DB real).
- [ ] **Endpoint HTTP para `CrearUsuarioAdmin`** — ya implementado y protegido por sesión (`POST /api/usuarios`, Plan 4), pendiente de la misma Tarea 10 para probarlo contra la DB real.
- [ ] **Endpoints de gestión de `Miembro`/`Pago`/`Suscripcion`** — hoy solo se crean vía `seed.ts`. El panel admin no tiene ninguna pantalla ni API para altas/bajas reales todavía.

## 🟡 Funcionalidad core pendiente (definida en el ADR, no implementada)

- [ ] **Integración real de la API BCV** — `BcvApiAdapter` (packages/infrastructure/exchange-rate, hoy vacío), `apps/worker` (no existe como app todavía), caso de uso `ActualizarTasaDiaria`. La tabla `TasaCambio` existe pero nada la llena. Proveedor aprobado: API no oficial tipo pydolarve/dolarapi (endpoint concreto sin fijar).
- [ ] **App de kiosco física** (`apps/kiosk`) — hoy `/api/checkin` se prueba con `curl`; no existe ninguna interfaz real para el kiosco (PWA, según el ADR).
- [ ] **Rotación/regeneración de `apiKey` de una `Sucursal`** — hoy solo se genera al crear la fila, sin manera de rotarla si se filtra.
- [ ] **Matriz de permisos granular** — hoy solo existe una regla ("crear `UsuarioAdmin` es exclusivo de `DUENO`"). Graduar cuando un segundo caso de uso real lo exija (regla explícita del ADR, no antes).

## 🟢 Diseño / expansión futura (paquetes ya scaffolded, vacíos)

- [ ] `packages/design-system` — tokens base (spacing, tipografía, sombras)
- [ ] `packages/theming` — motor de resolución de `TemaOrganizacion` por variables CSS
- [ ] `packages/ui` — componentes React compartidos entre `apps/web-admin` y el futuro `apps/kiosk`
- [ ] `packages/config` — presets compartidos de tsconfig/eslint/tailwind
- [ ] `packages/domain-custom` — casos de uso a medida por cliente (solo cuando exista un cliente real que lo pida)

---

## Notas de mantenimiento (no son tareas, son recordatorios operativos)

- Después de cualquier cambio a `packages/db/prisma/schema.prisma`, correr `npx prisma generate` en cada máquina — el cliente generado no se versiona.
- `packages/db/Dockerfile.migrate` sigue en el repo (temporal, para correr migraciones desde un servidor con red hacia la DB) — se puede borrar cuando se confirme que ya no hace falta.
