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

### Plan 4 — Login/sesión del panel admin
- [x] Modelo `Sesion` (tabla nueva, migrada y aplicada contra la base real)
- [x] `IniciarSesion`/`CerrarSesion`/`ValidarSesion` + `BcryptPasswordHasher`/`PrismaSesionRepository`
- [x] Rutas `/api/auth/login`, `/api/auth/logout`, `/api/usuarios` (protegida) + página `/login`
- [x] Todo verificado extremo a extremo contra la base de datos real, incluida la página `/login` en el navegador

### Plan 5 — Gestión de Miembro
- [x] `Miembro` extendido (`entrenadorNombre`, `fechaVencimiento`) + `IMemberRepository` con `buscarPorId`/`listarPorOrganizacion`/`crear`/`actualizar`
- [x] Casos de uso `CrearMiembro` (con `CedulaDuplicadaError`), `ListarMiembros`, `ObtenerMiembro`, `ActualizarMiembro` (cada uno con su `MiembroNoEncontradoError`)
- [x] `PrismaMemberRepository` extendido + rutas `GET/POST /api/miembros` y `GET/PATCH /api/miembros/[id]`, todas protegidas por sesión
- [x] Todo verificado extremo a extremo contra la base de datos real: login, 401 sin sesión, 201 al crear, 409 por cédula duplicada, 200 en detalle/edición, baja lógica con `activo:false`, 404 en id inexistente

### Plan 6 — Gestión de Pago/Suscripcion/Plan
- [x] Entidades `Plan`/`Pago` + `IPlanRepository`/`IPagoRepository`, extensión de `ISuscripcionRepository` (`buscarActivaVigentePorMiembroYPlan`/`extenderFin`/`crear`) y de `IMemberRepository` (`actualizarFechasPago`)
- [x] Casos de uso `CrearPlan` (valida `sucursalIds` por organización), `ListarPlanes`, `ActualizarPlan`, `RegistrarPago` (extiende la `Suscripcion ACTIVA` 30 días desde `max(fin, hoy)` o crea una nueva, sincroniza `Miembro.fechaUltimoPago`/`fechaVencimiento`, rechaza planes inactivos), `ListarPagos`
- [x] Rutas `GET/POST /api/planes`, `PATCH /api/planes/[id]`, `GET/POST /api/pagos`, todas protegidas por sesión
- [x] Todo verificado extremo a extremo contra la base de datos real (11 casos): listar planes del seed, crear plan `TODA_LA_ORGANIZACION`, rechazar `SEDE_UNICA` sin sucursales (400), editar plan, registrar pago (extiende a hoy+30), listar historial de pagos, segundo pago inmediato (extiende a hoy+60 desde el `fin` anterior, no desde hoy), pago contra plan inexistente (404)

### Plan 7 — Integración API BCV
- [x] Entidad `TasaCambio` + puertos `IExchangeRateService`/`ITasaCambioRepository`
- [x] Casos de uso `ActualizarTasaDiaria` (con fallback a la última tasa guardada si la API falla, sin crear filas falsas), `ObtenerTasaActual`, `ConvertirMontoUSDaVES`
- [x] `BcvApiAdapter` contra `dolarapi.com` (`https://ve.dolarapi.com/v1/dolares/oficial`) + `PrismaTasaCambioRepository` (upsert idempotente por día calendario)
- [x] `apps/worker` — app nueva del monorepo con el script `actualizar-tasa` (sin daemon, pensado para un cron externo) + `GET /api/tasa-cambio` protegida por sesión
- [x] Todo verificado extremo a extremo contra la API real y la base de datos real: tasa guardada correctamente, idempotencia confirmada (correr el script 2 veces no duplica la fila), lectura con sesión (200) y sin sesión (401)

---

## 🔴 Bloqueadores antes de exponer nada a un usuario real

- [x] **Login/sesión del panel admin** — Plan 4, completo y verificado contra la base real.
- [x] **Endpoint HTTP para `CrearUsuarioAdmin`** — `POST /api/usuarios`, protegido por sesión, verificado (401 sin sesión, 201 con sesión de DUENO).
- [x] **Endpoints de gestión de `Miembro`** — Plan 5, completo y verificado contra la base real (alta, detalle, edición, baja lógica).
- [x] **Endpoints de gestión de `Pago`/`Suscripcion`/`Plan`** — Plan 6, completo y verificado contra la base real.

Sin bloqueadores 🔴 pendientes. Lo que sigue es funcionalidad core (🟡) y expansión futura (🟢) — ver abajo.

## 🟡 Funcionalidad core pendiente (definida en el ADR, no implementada)

- [x] ~~Integración real de la API BCV~~ — Plan 7, completo y verificado contra la API y la base reales. Pendiente aparte (no bloqueante): agendar el cron externo real (`0 23 * * 1-5` UTC sugerido) y, cuando exista un consumidor real, integrar `ConvertirMontoUSDaVES`/`Sucursal.tasaCambioUSD` en `RegistrarPago`.
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
