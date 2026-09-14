# Handoff — gym-app

## Objetivo
Migrar `gym-app` de app única a monorepo Turborepo, de schema single-tenant a SaaS multi-tenant, de lógica inline a arquitectura hexagonal, agregar login/sesión y CRUD de `Miembro` al panel admin (API + UI real) — siguiendo el ADR-001 (v1 + v2) y `docs/ROADMAP.md`, con superpowers (`writing-plans` + `executing-plans` + `subagent-driven-development`).

## Estado actual — Planes 1–10 completos al 100%. Planes 1–7 verificados contra la base y la API reales; Plan 8 con verificación end-to-end del usuario pendiente (no bloqueante); Planes 9 y 10 verificados sin DB (tsc/build/lint), falta su prueba en navegador contra la base real (la corre el usuario). Sin bloqueadores 🔴 pendientes en `docs/ROADMAP.md`.
- **Plan 1** (Turborepo scaffold), **Plan 2** (schema Organizacion/Sucursal), **Plan 3** (dominio hexagonal), **Plan 4** (login/sesión del panel admin), **Plan 5** (gestión de `Miembro`, API), **Plan 6** (gestión de Pago/Suscripcion/Plan), **Plan 7** (integración API BCV), **Plan 8** (app de kiosco `apps/kiosk`): completos, ver `docs/ROADMAP.md` para el detalle (no repetido acá por brevedad, sin cambios desde el handoff anterior salvo la renumeración: el kiosco pasó a ser Plan 8, lo que corría antes como "Plan 8" — panel admin de Miembros — es ahora Plan 9).
- **Plan 9** (`docs/superpowers/plans/2026-09-13-panel-admin-miembros.md` — Panel Admin, pantalla de Miembros): completo, ejecutado con `superpowers:subagent-driven-development`. Ver detalle abajo.
- **Plan 10** (`docs/superpowers/plans/2026-09-13-panel-pagos-planes.md` — Panel Admin, pantallas de Pagos y Planes): completo, ejecutado con `superpowers:subagent-driven-development` (16 tareas + revisión final de todo el branch con 2 fixes aplicados). Ver detalle abajo.

## Plan 10 — Panel Admin: pantallas de Pagos y Planes (UI real)
- Precedido de una sesión de brainstorming completa (spec en `docs/superpowers/specs/2026-09-13-panel-pagos-planes-design.md`) antes de escribir el plan — decisiones clave: registrar pago desde ambas entradas (`/pagos/nuevo` y ficha de miembro), historial global y por miembro, `tipoAcceso`/sucursales de un Plan solo-lectura en edición, selector de plan solo activos, método de pago con opciones fijas (`efectivo_usd`/`efectivo_bs`/`transferencia`/`zelle`/`binance_usdt`/`pago_movil`, tomadas del comentario del schema de Prisma).
- **Creados:**
  - `packages/domain/entities/SucursalResumen.ts` (sin `apiKey`, entidad independiente de `Sucursal`) + `packages/domain/use-cases/ListarSucursales.ts`
  - `packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts` — primera implementación de `ISucursalRepository` en el repo (`listarPorOrganizacion` con `select: {id, nombre}` explícito, estructuralmente incapaz de filtrar `apiKey`; `buscarPorApiKey` implementado también aunque sin consumidores — la autenticación real del kiosco sigue usando `IKioskAuthValidator`/`KioskTokenValidator`, puerto distinto, no tocado)
  - `apps/web-admin/app/(panel)/planes/{actions.ts,FormularioPlan.tsx,obtenerSucursales.ts,page.tsx,nuevo/page.tsx,[id]/page.tsx}` — CRUD completo de `Plan` con checkboxes de sucursales condicionales a `tipoAcceso`
  - `apps/web-admin/app/(panel)/pagos/{actions.ts,FormularioPago.tsx,page.tsx,nuevo/page.tsx}` — alta y listado global de `Pago`
- **Modificados:**
  - `packages/domain/entities/Pago.ts` (+ `miembroNombre?` denormalizado), `packages/domain/ports/IPagoRepository.ts` (+ `listarPorOrganizacion`), `packages/domain/use-cases/ListarPagos.ts` (`miembroId` opcional — sin él lista toda la organización), `packages/infrastructure/persistence/prisma/PrismaPagoRepository.ts` (implementa, con `include` a `Miembro` para el nombre)
  - `apps/web-admin/app/api/pagos/route.ts` — `GET` extendida para aceptar listar sin `miembroId` (retrocompatible, `?miembroId=` sigue funcionando igual)
  - `apps/web-admin/app/(panel)/miembros/[id]/page.tsx` (del Plan 9) — extendida con historial de pagos del miembro + alta de pago inline; verificado línea por línea que la funcionalidad existente (formulario de edición, dar de baja/reactivar) no sufrió ninguna regresión
- **Revisión final de todo el branch (opus):** 2 hallazgos Important, ambos gaps de diseño cruzados entre tareas (no errores de transcripción) — corregidos en un solo commit de fix + re-review acotada, limpia:
  1. `registrarPagoAction` redirigía incondicionalmente a `/miembros/[id]` incluso cuando se invocaba desde esa misma página (el flujo inline agregado a la ficha del miembro), causando un remount que descartaba ediciones sin guardar en el formulario de datos del miembro → fix: input oculto `origen="miembro"` que suprime el redirect en ese caso (el `revalidatePath` ya alcanzaba para refrescar el historial in-place).
  2. El selector de miembros en `/pagos/nuevo` no filtraba miembros inactivos, a diferencia del selector de planes (que sí filtraba `activo: true`) → fix: `miembrosActivos`, mismo patrón que `planesActivos`.
- **5 hallazgos Minor parqueados con ruling** (no bloquean): falta un comentario explicando por qué el `select` de `PrismaSucursalRepository.listarPorOrganizacion` excluye `apiKey`; `FormularioPlan` no explica al usuario por qué `tipoAcceso`/sucursales aparecen deshabilitados en edición; el dominio `RegistrarPago` sigue sin validar `Miembro.activo` (pregunta de producto abierta, ver abajo); `/pagos` y el historial en la ficha de miembro no tienen paginación (ya diferido explícitamente en el plan); doble instanciación de `PrismaMemberRepository` en `miembros/[id]/page.tsx`.
- **Verificación sin DB (todo verde):** `tsc --noEmit`, `turbo run build --filter=web-admin` (rutas `/planes`, `/planes/nuevo`, `/planes/[id]`, `/pagos`, `/pagos/nuevo` en el build junto con las de Miembros), `turbo run lint --filter=web-admin`.
- **Pendiente del usuario:** Tarea 18 del plan — probar en el navegador contra la base real (crear/editar/dar de baja/reactivar un Plan, listar y registrar Pagos desde ambas entradas, confirmar que el historial se actualiza en ambos lugares sin perder el formulario de edición del miembro).
- **Pendiente de decisión del usuario (no bloqueante):** ¿debería `RegistrarPago` rechazar pagos contra un `Miembro` inactivo? Hoy el dominio no lo valida — es una pregunta de producto, no un bug, documentada en la revisión final para decidir en un plan futuro.
- Todo commiteado a `main` (working directo, sin worktree — mismo criterio que el Plan 9). Commits: `577dd09`, `c1d339b`, `2bd726e`, `b7f157c`, `b166ebd`, `5ded03f`, `fc34b6a`, `e1f456c`, `a070aec`, `ac417a4`, `332c357`, `2402ca4`, `ffd2b4e`, `be9d938`, `02694be`, `9edfef8`, `583819a`.

## Plan 9 — Panel Admin: pantalla de Miembros (UI real)
- Primera UI real del panel (`apps/web-admin`) — hasta ahora todo se probaba solo con `curl`. Server Components + Server Actions que llaman **directo** a los casos de uso de dominio del Plan 5 (no pasan por `/api/miembros*`, que quedan intactas para consumidores externos).
- **Creados:**
  - `packages/ui/components/{Button,Input,Badge,Sidebar}.tsx` — primeros componentes reales de `packages/ui` (antes vacío), `peerDependencies` a `next`/`react`.
  - `apps/web-admin/app/(panel)/layout.tsx` — layout con sidebar (Miembros/Pagos/Planes, solo Miembros con contenido), redirige a `/login` sin sesión.
  - `apps/web-admin/app/(panel)/miembros/actions.ts` — Server Actions `crearMiembroAction`, `actualizarMiembroAction`, `darDeBajaAction`, `reactivarAction` (agregada en la revisión final).
  - `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx` — formulario compartido alta/edición (`useActionState`, cédula deshabilitada en edición).
  - `apps/web-admin/app/(panel)/miembros/page.tsx` (listado), `.../nuevo/page.tsx` (alta), `.../[id]/page.tsx` (edición + baja lógica + reactivación).
- **Modificados:** `packages/ui/package.json`, `apps/web-admin/package.json` (+ `@gym-app/ui`), `apps/web-admin/next.config.ts` (+ `transpilePackages`), `apps/web-admin/app/globals.css` (+ `@source` para Tailwind v4), `apps/web-admin/lib/sesion.ts` (+ `obtenerUsuarioDeSesionActual` para Server Components, sin tocar la función existente que usan las rutas API), `apps/web-admin/app/page.tsx` (reemplazado el boilerplate por un redirect), `apps/web-admin/app/login/page.tsx` (redirige a `/miembros` en vez de `/`).
- **Revisión final de todo el branch (opus):** 2 hallazgos Important, ambos gaps del plan original (no errores de transcripción) — corregidos en un solo commit de fix + re-review acotada, limpia:
  1. Panel ilegible en dark mode (ningún componente nuevo tenía variantes `dark:`) → fix mínimo: `bg-white text-neutral-900` explícito en el layout del panel (theming completo queda diferido a `packages/theming`, en el roadmap).
  2. No había forma de reactivar un miembro dado de baja desde la UI (dominio/API ya lo soportaban) → se agregó `reactivarAction` + botón "Reactivar" condicional.
- **5 hallazgos Minor parqueados con ruling** (no bloquean, no ameritan otra ronda): `precioPlan` acepta 0/negativo (mismo defecto ya en la API REST, no es regresión), un cast de `planTipo` en `actualizarMiembroAction` podría pasar `""` a Prisma si se craftea el payload a mano (no alcanzable desde el formulario real), no hay botón de logout visible en el panel, comentario desactualizado en `lib/sesion.ts` sobre la ausencia de `middleware.ts`, y el `app/layout.tsx` raíz sigue con el título/lang de `create-next-app` (fuera del diff de este plan). Detalle completo en el ledger (ya borrado tras el merge, ver `git log` de los commits `2db7e36..69cb643`).
- **Verificación sin DB (todo verde):** `tsc --noEmit`, `turbo run build --filter=web-admin` (rutas `/`, `/miembros`, `/miembros/nuevo`, `/miembros/[id]` en el build), `turbo run lint --filter=web-admin`.
- **Pendiente del usuario:** Tarea 10 del plan — probar en el navegador contra la base real (login → redirect a `/miembros`, listar, crear, cédula duplicada inline, editar, cédula deshabilitada, dar de baja, reactivar, acceso sin sesión redirige a `/login`).
- Todo commiteado a `main` (working directo, sin worktree — decisión del usuario). Commits: `2db7e36`, `1f504b3`, `b6b8b53`, `be5f565`, `0244425`, `c939fea`, `c159c8d`, `3254aed`, `69cb643`.
- **Plan 7 — Tarea 8 (pruebas contra la API y la DB reales) verificada por el usuario, los 5 casos pasaron:**
  1. `npm install` + `npm run actualizar-tasa` → `✅ Tasa BCV actualizada: 832.4883 VES/USD (2026-09-11T00:00:00.000Z)` ✅
  2. Fila en `TasaCambio` → 1 fila, `fuente:"BCV"`, `valor:832.4883` ✅
  3. Correr el script de nuevo → mismo `id`, sigue habiendo 1 sola fila (upsert idempotente confirmado) ✅
  4. `GET /api/tasa-cambio` con cookie → `200`, `{"valor":832.4883,"fuente":"BCV",...}` ✅
  5. `GET /api/tasa-cambio` sin cookie → `401 "No autenticado."` ✅

## Archivos y cambios (Plan 7 — integración API BCV)
- **Creados:**
  - `packages/domain/entities/TasaCambio.ts`
  - `packages/domain/ports/{IExchangeRateService,ITasaCambioRepository}.ts`
  - `packages/domain/use-cases/{ActualizarTasaDiaria,ObtenerTasaActual,ConvertirMontoUSDaVES}.ts` — `ActualizarTasaDiaria` llama a `IExchangeRateService`, guarda en `TasaCambio`, y si la API falla cae al último valor ya guardado (`SinTasaDisponibleError` solo si no hay ninguno todavía) sin crear una fila falsa.
  - `packages/infrastructure/exchange-rate/BcvApiAdapter.ts` — pega contra `https://ve.dolarapi.com/v1/dolares/oficial` (forma real del JSON verificada por el usuario), usa el campo `promedio`.
  - `packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts` — `upsert` por día calendario (normaliza `fecha` a medianoche UTC) para que el `@@unique` de `TasaCambio.fecha` no duplique filas en reintentos del mismo día.
  - **`apps/worker`** — app nueva del monorepo (sin Next.js): `package.json`, `tsconfig.json`, `src/actualizar-tasa.ts`. Se corre con `npm run actualizar-tasa` (delegado desde el `package.json` raíz). Sin daemon — se agenda con un cron externo (Easypanel/GitHub Actions), no configurado en este plan.
  - `apps/web-admin/app/api/tasa-cambio/route.ts` — GET, protegida por sesión, devuelve la última `TasaCambio` guardada (404 si `apps/worker` nunca corrió).
- **Modificado:** `package.json` raíz (+ script `actualizar-tasa`).
- **Sin migración** — el modelo `TasaCambio` ya existía desde el Plan 2.
- **Decisiones de alcance:** frecuencia 1 vez/día hábil (la tasa oficial del BCV se publica así, no hay webhook real); `Sucursal.tasaCambioUSD` y la integración con `RegistrarPago`/`BinanceP2PAdapter` quedan explícitamente diferidas (sin consumidor real todavía).
- **Verificación sin DB/red externa (todo verde):** `tsc --noEmit` en `apps/worker` y `apps/web-admin` (con un fix de tipos: `fetch().json()` devuelve `unknown` sin la lib `dom`, se casteó explícito a `RespuestaDolarApi`), `turbo run build --filter=web-admin` (ruta `/api/tasa-cambio` visible, sin dependencia circular), `turbo run lint --filter=web-admin`.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak` (últimos commits: `4466a8a`, `9832e50`, `1865739`, `b639187`, `dd71c60`, `f728cf0`, `a0d361d`).
- **Plan 6 — Tarea 10 (pruebas contra la DB real) verificada por el usuario, los 11 casos pasaron:**
  1. Login → `200` + cookie de sesión ✅
  2. `GET /api/planes` → `200`, incluye "Sede Única" del seed ✅
  3. `POST /api/planes` (`TODA_LA_ORGANIZACION`, sin `sucursalIds`) → `201`, "VIP Multi-sede" creado ✅
  4. `POST /api/planes` (`SEDE_UNICA`, sin `sucursalIds`) → `400 "Un plan que no es TODA_LA_ORGANIZACION necesita al menos una sucursal asignada."` ✅
  5. `PATCH /api/planes/[id]` (bajar `precioUSD`) → `200`, `precioUSD:35` ✅
  6. `POST /api/pagos` (Julio César Bastidas × "Sede Única") → `201` ✅
  7. `GET /api/miembros/[id]` → `fechaVencimiento` = hoy + 30 días ✅
  8. `GET /api/pagos?miembroId=` → `200`, historial con el pago de $25 ✅
  9. Segundo `POST /api/pagos` inmediato al mismo miembro/plan → `201` ✅
  10. `GET /api/miembros/[id]` tras el 2º pago → `fechaVencimiento` = hoy + 60 días (se sumó desde el `fin` anterior, no desde hoy — confirma la lógica de extensión) ✅
  11. `POST /api/pagos` con `planId` inexistente → `404 "No se encontró el plan."` ✅

## Archivos y cambios (Plan 6 — gestión de Pago/Suscripcion/Plan)
- **Creados:**
  - `packages/domain/entities/Plan.ts` — entidad completa del Plan de acceso a sucursales (`nombre`, `tipoAcceso`, `precioUSD`, `activo`), separada del `Plan` embebido mínimo que ya usaba `Suscripcion.ts` para el check-in (no se tocó ese archivo).
  - `packages/domain/entities/Pago.ts`
  - `packages/domain/ports/{IPlanRepository,IPagoRepository}.ts`
  - `packages/domain/use-cases/{CrearPlan,ListarPlanes,ActualizarPlan,RegistrarPago,ListarPagos}.ts` — `CrearPlan` valida que las `sucursalIds` pertenezcan a la organización (`SucursalInvalidaError`) y que un plan que no es `TODA_LA_ORGANIZACION` tenga al menos una sucursal (`SucursalesRequeridasError`); `RegistrarPago` extiende la `Suscripcion ACTIVA` vigente sumando 30 días desde `max(fin, hoy)` o crea una nueva si no hay ninguna, sincroniza `Miembro.fechaUltimoPago`/`fechaVencimiento`, y rechaza pagos contra un plan `activo:false` (`PlanInactivoError`).
  - `packages/infrastructure/persistence/prisma/{PrismaPlanRepository,PrismaPagoRepository}.ts`
  - `apps/web-admin/app/api/planes/route.ts` (GET lista / POST crea), `apps/web-admin/app/api/planes/[id]/route.ts` (PATCH edita `nombre`/`precioUSD`/`activo` — `tipoAcceso` es inmutable), `apps/web-admin/app/api/pagos/route.ts` (POST registra pago / GET `?miembroId=` historial)
- **Modificados:** `packages/domain/ports/IMemberRepository.ts` (+ `actualizarFechasPago`), `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` (implementa), `packages/domain/ports/ISuscripcionRepository.ts` (+ `buscarActivaVigentePorMiembroYPlan`/`extenderFin`/`crear`), `packages/infrastructure/persistence/prisma/PrismaSuscripcionRepository.ts` (implementa, refactorizado con un `mapear()` compartido).
- **Sin migración** — todos los modelos (`Plan`, `Suscripcion`, `Pago`, `PlanSucursalAcceso`) ya existían desde el Plan 2.
- **Verificación sin DB (todo verde):** `tsc --noEmit` en `apps/web-admin`, `turbo run build --filter=web-admin` (rutas `/api/planes`, `/api/planes/[id]`, `/api/pagos` aparecen en el build, sin warning de dependencia circular), `turbo run lint --filter=web-admin`.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak` (últimos commits: `0b6bf9a`, `19ed4e0`, `326193d`, `d5a636d`, `6ed9898`, `3e3d9e3`, `6fb1dd3`, `d5bb776`).
- **Plan 5 — Tarea 7 (pruebas contra la DB real) verificada por el usuario, los 8 casos pasaron:**
  1. Login → `200` + cookie de sesión ✅
  2. `GET /api/miembros` sin cookie → `401 "No autenticado."` ✅
  3. `POST /api/miembros` → `201`, miembro creado ✅
  4. Repetir el mismo `POST` (misma cédula) → `409 "Ya existe un miembro con esa cédula en esta organización."` ✅
  5. `GET /api/miembros/[id]` → `200` con el detalle completo ✅
  6. `PATCH` cambiando `celular` → `200` con el campo actualizado ✅
  7. `PATCH {"activo": false}` (baja lógica) → `200` con `activo:false` ✅
  8. `GET` de un id inexistente → `404 "No se encontró el miembro."` ✅

## Archivos y cambios (Plan 5 — gestión de Miembro)
- **Modificados:** `packages/domain/entities/Miembro.ts` (agrega `entrenadorNombre`, `fechaVencimiento`, tipos `DatosNuevoMiembro`/`CambiosMiembro`), `packages/domain/ports/IMemberRepository.ts` (agrega `buscarPorId`, `listarPorOrganizacion`, `crear`, `actualizar`), `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` (implementa los 4 métodos nuevos, mapeo completo incluyendo `entrenador.nombre` y `precioPlan.toNumber()`).
- **Creados:**
  - `packages/domain/use-cases/CrearMiembro.ts` (+ `CedulaDuplicadaError`)
  - `packages/domain/use-cases/ListarMiembros.ts`
  - `packages/domain/use-cases/ObtenerMiembro.ts` (+ `MiembroNoEncontradoError`)
  - `packages/domain/use-cases/ActualizarMiembro.ts` (+ `MiembroNoEncontradoError` propia)
  - `apps/web-admin/app/api/miembros/route.ts` — GET (lista) / POST (crea, 409 si cédula duplicada), ambas protegidas por sesión
  - `apps/web-admin/app/api/miembros/[id]/route.ts` — GET (detalle, 404 si no existe o es de otra organización) / PATCH (edita campos o da de baja lógica con `{"activo": false}`, 404 si no existe)
- **Decisión de alcance documentada en el plan:** este plan cubre solo `Miembro`. `Pago`/`Suscripcion` quedan para un plan siguiente (ya con el diseño acordado: `RegistrarPago` crea/extiende la `Suscripcion` `ACTIVA` del `Plan` correspondiente).
- **Verificación sin DB (todo verde):** `tsc --noEmit` en `domain` e `infrastructure`, `turbo run build --filter=web-admin` (rutas `/api/miembros` y `/api/miembros/[id]` aparecen en el build, sin warning de dependencia circular), `turbo run lint --filter=web-admin`.
- Todo commiteado y pusheado a `main` y a `claude/gifted-hawking-ikltak` (últimos commits: `40aaac0`, `553ad92`, `2a3d8b0`, `5a50070`, `da260e3`).

## Resumen Planes 1–4 (contexto histórico, sin cambios desde el handoff anterior)
- **Plan 4**: modelo `Sesion` (token opaco, cookie httpOnly, revocable en DB), `IniciarSesion`/`CerrarSesion`/`ValidarSesion`, `BcryptPasswordHasher`/`PrismaSesionRepository`, rutas `/api/auth/login`, `/api/auth/logout`, `/api/usuarios` (protegida, expone `CrearUsuarioAdmin`), página `/login`. Todas las pruebas contra la DB real pasaron (login incorrecto → 401, login correcto → 200 + cookie, `/api/usuarios` sin sesión → 401, con sesión → 201, logout invalida la cookie en DB, página `/login` funciona en navegador).
- **Archivos clave Plan 4:** `packages/domain/entities/Sesion.ts`, `packages/domain/ports/{IPasswordHasher,ISesionRepository}.ts`, `packages/domain/use-cases/{IniciarSesion,CerrarSesion,ValidarSesion}.ts`, `packages/infrastructure/auth/BcryptPasswordHasher.ts`, `packages/infrastructure/persistence/prisma/PrismaSesionRepository.ts`, `apps/web-admin/lib/sesion.ts`, `apps/web-admin/app/api/auth/{login,logout}/route.ts`, `apps/web-admin/app/api/usuarios/route.ts`, `apps/web-admin/app/login/page.tsx`.

## Lecciones a seguir aplicando (repetidas en Planes 3 y 4, siguen vigentes)
- **El cliente de Prisma generado en la máquina del usuario queda desactualizado tras cada cambio de schema.** Regla: después de CUALQUIER `git pull` que traiga cambios a `schema.prisma`, correr `npx prisma generate` explícito antes de `npm run dev`, sin asumir que `migrate dev` ya lo hizo.
- **No usar `@default(uuid())`/similares a nivel de Prisma** para generar valores en creación — generar explícito en código (`randomUUID()`/`randomBytes()` de `node:crypto`).
- Esta sandbox no tiene acceso TCP crudo a la DB real (`31.220.56.1:5456`) — todas las tareas que tocan la DB (migraciones, seed, curl contra el server corriendo) las corre el usuario en su máquina y pega el resultado acá.

## Próximos pasos
`docs/ROADMAP.md` ya refleja los Planes 1–10 cerrados — **sin bloqueadores 🔴 pendientes**. Queda, sin urgencia:
1. **Usuario:** correr la Tarea 18 del Plan 10 en el navegador contra la base real (ver detalle en la sección del Plan 10 arriba).
2. **Usuario:** completar la verificación end-to-end pendiente del Plan 8 (kiosco) — check-in real, cédula inexistente, simular pérdida de red.
3. Decidir si `RegistrarPago` debe rechazar pagos contra un `Miembro` inactivo (pregunta de producto del Plan 10, no bloqueante).
4. Agendar el cron externo real para `npm run actualizar-tasa` (Easypanel scheduled job u otro) — sugerido `0 23 * * 1-5` UTC (7pm VET, lunes a viernes). No configurado en ningún plan todavía — es deploy, no código.
5. Integrar `ConvertirMontoUSDaVES` en algún consumidor real (ej. `RegistrarPago` mostrando el equivalente en VES) cuando haga falta.
6. Rotación de `apiKey` de `Sucursal`, matriz de permisos más granular, botón de logout visible, theming/dark mode completo (`packages/theming`) — ver `docs/ROADMAP.md` para el detalle.
7. `packages/db/Dockerfile.migrate` sigue en el repo, inofensivo, se puede borrar cuando se confirme que ya no hace falta.
