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

### Plan 8 — App de kiosco física (`apps/kiosk`)
- [x] `apps/kiosk` — Next.js estático (`output: "export"`), sin ninguna dependencia de `@gym-app/domain`/`infrastructure`/`db` (cero lógica de negocio, tal como exige el ADR)
- [x] Pantalla `/config` (guarda el `apiKey` de la Sucursal en `localStorage` del dispositivo) y pantalla principal `/` con input siempre enfocado para el teclado numérico físico del kiosco (ADR v1 §2.5 — no es pantalla táctil)
- [x] Cola de pendientes offline real vía IndexedDB (`lib/colaPendientes.ts`) con reintento automático al volver la red (`lib/reintentarPendientes.ts`)
- [x] CORS agregado a `POST /api/checkin` para la llamada cross-origin desde el kiosco
- [x] Service worker (precache del shell, network-first para HTML) + manifest + `Dockerfile` propio (build estático servido con `serve`)
- [x] Revisión final: fixes de Dockerfile (tag de imagen inválido), `lib/api.ts` (orden de parseo de errores), `turbo.json` (output `out/**` para el build de export), estrategia de caché del service worker
- [x] **Verificado por el usuario:** check-in real contra miembros reales (activo y vencido) probado end-to-end en el kiosco desplegado.

### Plan 9 — Panel Admin: pantalla de Miembros (UI real)
- [x] `packages/ui` poblado por primera vez: `Button`, `Input`, `Badge`, `Sidebar` (peerDependencies a next/react, no dependencies)
- [x] `obtenerUsuarioDeSesionActual()` en `lib/sesion.ts` — helper de sesión para Server Components/Actions (no toca la función existente usada por las rutas API)
- [x] Layout `(panel)` con sidebar (Miembros/Pagos/Planes, solo Miembros con contenido) + `app/page.tsx` como redirect + `/login` redirige a `/miembros`
- [x] Server Actions `crearMiembroAction`/`actualizarMiembroAction`/`darDeBajaAction`/`reactivarAction` (llaman directo a los casos de uso de dominio del Plan 5, mismo patrón de repositorio que las rutas API)
- [x] `FormularioMiembro` compartido (alta/edición) con `useActionState`, cédula deshabilitada en edición
- [x] Páginas `/miembros` (listado), `/miembros/nuevo` (alta), `/miembros/[id]` (edición + baja lógica + reactivación)
- [x] Verificado sin DB: `tsc --noEmit`, `turbo run build --filter=web-admin` (rutas `/`, `/miembros`, `/miembros/nuevo`, `/miembros/[id]` en el build), `turbo run lint --filter=web-admin`
- [x] Revisión final de todo el branch: 2 hallazgos Important corregidos (panel ilegible en dark mode — sin fix de theming completo, solo `bg-white`/`text-neutral-900` explícito en el layout; faltaba reactivar un miembro dado de baja desde la UI) — ambos gaps del plan original, no de la implementación
- [x] Tarea 10 del plan — probado en producción por el usuario, funcionando correctamente
- Diferido explícitamente (Pagos/Planes ya no aplica, ver Plan 10 abajo): asignar Entrenador desde la UI, dashboard general, búsqueda/filtro/paginación, subida real de `fotoUrl`, gestión de `UsuarioAdmin` desde la UI, botón de logout visible, theming/dark mode completo (queda para `packages/theming`)

### Plan 10 — Panel Admin: pantallas de Pagos y Planes (UI real)
- [x] `SucursalResumen` (entidad nueva, sin `apiKey`) + `ISucursalRepository.listarPorOrganizacion` + caso de uso `ListarSucursales` + `PrismaSucursalRepository` (primera implementación de ese puerto en el repo — `buscarPorApiKey` sigue sin consumidores, la autenticación real del kiosco usa `IKioskAuthValidator`/`KioskTokenValidator`)
- [x] `Pago.miembroNombre` (denormalizado) + `IPagoRepository.listarPorOrganizacion` + `ListarPagos` extendido (miembroId opcional, sin él lista toda la organización) + `GET /api/pagos` extendida de forma retrocompatible
- [x] Server Actions `crearPlanAction`/`actualizarPlanAction`/`darDeBajaPlanAction`/`reactivarPlanAction` + `FormularioPlan` (checkboxes de sucursales condicionales a `tipoAcceso`, `tipoAcceso`/sucursales deshabilitados en edición) + páginas `/planes`, `/planes/nuevo`, `/planes/[id]`
- [x] Server Action `registrarPagoAction` + `FormularioPago` compartido (selector de miembro oculto vía `miembroIdFijo` cuando se invoca desde la ficha de un miembro) + páginas `/pagos` (listado global), `/pagos/nuevo`
- [x] `/miembros/[id]` (Plan 9) extendida con historial de pagos del miembro + alta de pago inline — verificado línea por línea que no hubo regresión sobre la funcionalidad existente
- [x] Verificado sin DB: `tsc --noEmit`, `turbo run build --filter=web-admin` (rutas `/planes`, `/planes/nuevo`, `/planes/[id]`, `/pagos`, `/pagos/nuevo` en el build), `turbo run lint --filter=web-admin`
- [x] Revisión final de todo el branch: 2 hallazgos Important corregidos — (1) `registrarPagoAction` redirigía incondicionalmente a `/miembros/[id]` incluso invocado desde esa misma página, descartando ediciones sin guardar del formulario de datos del miembro (fix: input oculto `origen`, solo redirige si no vino del flujo inline); (2) el selector de miembros en `/pagos/nuevo` no filtraba inactivos, a diferencia del selector de planes (fix: `miembrosActivos`, mismo patrón). Ambos eran gaps de diseño cruzados entre tareas, no errores de transcripción.
- [x] **Verificado por el usuario:** uso real y sostenido de `/pagos`, `/planes` y el registro de pagos desde la ficha de un Miembro a lo largo de varias sesiones de prueba posteriores.
- **Pendiente de decisión del usuario (no bloqueante):** ¿debería `RegistrarPago` rechazar pagos contra un `Miembro` inactivo? Hoy el dominio no lo valida (fuera del alcance de este plan, documentado como pregunta abierta en la revisión final).
- Diferido explícitamente: editar/cancelar un `Pago` ya registrado, dashboard/resumen financiero, filtros/búsqueda/paginación en `/pagos`/`/planes`, theming/dark mode completo (ver Plan 11), rotación de `apiKey` de `Sucursal`.
- ~~conversión USD↔VES en el formulario de pago~~ — hecho de forma provisional, ver "Ajustes ad-hoc" abajo (tasa fija 850, pendiente conectar `/api/tasa-cambio`).

### Plan 11 — Tema visual "Adrenalina Xtreme" (`packages/theming`)
- [x] `packages/theming` poblado por primera vez: tokens de color/tipografía (`tokens.ts`) + `ThemeStyleTag` (inyecta variables CSS en `:root`)
- [x] `LogoBadge` nuevo en `packages/ui` (logo circular + halo, Opción B del mockup aprobado por el usuario tras comparar 4 direcciones de diseño)
- [x] `/login` de `apps/web-admin` rediseñado con el tema — montado *solo* en esa página (nunca en el layout raíz) para no filtrar el verde/negro a `/miembros`, `/pagos`, `/planes`
- [x] `apps/kiosk` adopta el tema completo (layout raíz) + `AccessCard` nuevo, estilo carnet, con logo del gym, halo, foto grande y franja de estado (verde=activo/rojo=vencido)
- [x] Ajustes post-prueba del usuario: input de cédula reubicado (arriba, más chico), sin auto-ocultado por temporizador (el resultado se limpia al empezar a teclear la próxima cédula, no a los N segundos)
- [x] Verificado sin DB: `tsc --noEmit`, `turbo run build`/`lint` en `web-admin` y `kiosk`
- [x] **Verificado por el usuario:** login y check-in probados visualmente contra la base real, con miembros activo y vencido
- Diferido explícitamente: theming dinámico por `Organizacion` (`TemaOrganizacion`, ya modelado en el schema desde el Plan 2 pero sin consumidor), migrar `/login` a los componentes base de `packages/ui` en vez de estilos inline, subida real de logo (hoy es un archivo estático commiteado a mano)

### Ajustes ad-hoc — Nuevo Miembro / Registrar Pago (sin plan escrito, iterados en vivo con el usuario)
- [x] Selector de 4 planes con precio fijo (Semanal $8 / Corporativo $22 / Mensual sin-con entrenador $25-$30) + opción "Personalizado" con precio libre — reemplaza el precio manual que había antes
- [x] Campo "Fecha de inscripción" en `Miembro` (columna nueva, migración incluida, nullable — con fallback a `createdAt` para miembros viejos)
- [x] Subida de foto de perfil (Server Action + `fs`, guardada en `public/uploads/miembros`, **no versionada ni respaldada** — ver nota de deploy más abajo)
- [x] Selector de Entrenador (puerto/caso de uso/repositorio nuevos, no existían) bloqueado salvo que el plan elegido incluya entrenador
- [x] Ticket de confirmación ("¿Está seguro de la información suministrada?") en el panel derecho antes de guardar, con resumen completo (foto, plan, entrenador, método de pago)
- [x] Alta de miembro **crea/reutiliza el `Plan` real** correspondiente al preset elegido (`tipoAcceso: TODA_LA_ORGANIZACION`) y **registra el primer Pago/Suscripción en el mismo paso** — el miembro queda activo desde el día uno, sin pasar por "Registrar pago" aparte
- [x] `/miembros/[id]` reorganizada: "Dar de baja" se saca de ahí (ya vive en el switch de la lista), el historial de pagos pasa a su propia subpágina (`/miembros/[id]/pagos`) en vez de una tabla que crecía sin límite en el panel
- [x] Switch verde/rojo en la lista de Miembros (reemplaza el badge de texto), togglea `activo` sin entrar a la ficha, con confirmación solo al desactivar
- [x] "Registrar Pago" autocompleta el Monto (USD) al elegir un Plan; la tasa/monto en Bs solo aparece si el método de pago es en bolívares
- [x] Script `npm run db:limpiar-miembros --workspace packages/db` para vaciar Miembro/Pago/CheckIn/Suscripcion sin tocar Plan/Sucursal/UsuarioAdmin (útil para volver a probar desde cero)
- **Pendiente:** conectar la tasa BCV real (`/api/tasa-cambio`, ya existe desde el Plan 7) en vez de la fija de 850 usada hoy en ambos formularios (`tasaBcvFija.ts` documenta el punto exacto de reemplazo)
- Diferido explícitamente: que el catálogo de 4 planes+precios sea editable desde el panel sin tocar código (hoy es un array fijo en `planesPreset.ts`), unificar completamente `Miembro.planTipo/precioPlan` (recargo de entrenador) con el `Plan`/`Suscripcion` real

### Plan 12 — Cierre de Caja y Reportes de Miembros
- [x] `Pago.numeroOperacion` (últimos 4 dígitos del pago móvil, opcional) + `IPagoRepository.listarPorOrganizacionYRango` — usados por "Registrar pago", el "Primer pago" de Nuevo Miembro, y el reporte de caja
- [x] Modelo `CierreCaja` nuevo (sella el total de un día, no se puede cerrar dos veces) + dominio (`cerrarCaja`, `obtenerReporteCaja`)
- [x] Pantalla `/caja`: reporte con selector de período (día/semana/mes), tabla tipo libro de caja (miembro, método, N° operación, monto), desglose por método, botón "Cerrar caja de este día", e "Imprimir" (`window.print()` + `print:hidden` de Tailwind, sin PDF del lado del servidor)
- [x] `/miembros`: filtros por nombre/cédula, rango de fecha de inscripción y rango de vencimiento (vía `searchParams`, sin cambios al repositorio) + botón "Imprimir"
- [x] Fix post-prueba: `toISOString()` para formatear fechas locales saltaba al día siguiente pasadas las 8pm en Venezuela (UTC-4) — afectaba el rango de `/caja` y la fecha de inscripción por defecto/precargada en Miembro. Corregido armando el string a mano con componentes locales.
- [x] Fix post-prueba: se sacó la columna "Alta/Renovación" del reporte de caja — no era parte de lo pedido, se malinterpretó una anotación del cuaderno físico del dueño.
- [x] Verificado sin DB: `tsc --noEmit`, `turbo run build`/`lint` en `web-admin` (y `kiosk`, sin regresión)
- [x] **Verificado por el usuario:** `/caja` probada en el navegador contra la base real (pago con Pago Móvil, desglose por método, cierre del día).
- Diferido explícitamente: cierre de caja por Sucursal (hoy `Pago` no tiene noción de sucursal), restringir quién puede cerrar caja (matriz de permisos), bloquear pagos con fecha dentro de un día ya cerrado, exportar a PDF/Excel real, editar/anular un `CierreCaja` ya creado.

---

## 🔴 Bloqueadores antes de exponer nada a un usuario real

- [x] **Login/sesión del panel admin** — Plan 4, completo y verificado contra la base real.
- [x] **Endpoint HTTP para `CrearUsuarioAdmin`** — `POST /api/usuarios`, protegido por sesión, verificado (401 sin sesión, 201 con sesión de DUENO).
- [x] **Endpoints de gestión de `Miembro`** — Plan 5, completo y verificado contra la base real (alta, detalle, edición, baja lógica).
- [x] **Endpoints de gestión de `Pago`/`Suscripcion`/`Plan`** — Plan 6, completo y verificado contra la base real.

Sin bloqueadores 🔴 pendientes. Lo que sigue es funcionalidad core (🟡) y expansión futura (🟢) — ver abajo.

## 🟡 Funcionalidad core pendiente (definida en el ADR, no implementada)

- [x] ~~Integración real de la API BCV~~ — Plan 7, completo y verificado contra la API y la base reales. Conectada a `/api/tasa-cambio`, pero **todavía no** a los formularios que la necesitan (Nuevo Miembro/Registrar Pago usan una tasa fija de 850 — ver "Ajustes ad-hoc" arriba). Pendiente aparte (no bloqueante): agendar el cron externo real (`0 23 * * 1-5` UTC sugerido).
- [x] ~~App de kiosco física~~ — Plan 8, completo y verificado end-to-end por el usuario.
- [ ] **Conectar la tasa BCV real** a Nuevo Miembro y Registrar Pago (hoy usan 850 fijo) — ver `tasaBcvFija.ts`.
- [ ] **Rotación/regeneración de `apiKey` de una `Sucursal`** — hoy solo se genera al crear la fila, sin manera de rotarla si se filtra.
- [ ] **Matriz de permisos granular** — hoy solo existe una regla ("crear `UsuarioAdmin` es exclusivo de `DUENO`"). Graduar cuando un segundo caso de uso real lo exija (regla explícita del ADR, no antes).
- [ ] **Decisión de producto pendiente:** ¿`RegistrarPago` debería rechazar pagos contra un `Miembro` inactivo?
- [ ] **Deploy real** (Fase E del roadmap conversacional) — nada de esto se desplegó todavía a Docker/EasyPanel; cuando se haga, la carpeta `apps/web-admin/public/uploads/miembros` (fotos de perfil) va a necesitar un volumen persistente montado, o las fotos se pierden en cada rebuild del contenedor.
- [ ] **Onboarding** (Fase B del roadmap conversacional) — todavía no arrancó.
- [ ] Archivo `cookies.txt` suelto en la raíz del repo (quedó de una prueba de otra sesión) — pendiente de que el usuario confirme si se puede borrar.

## 🟢 Diseño / expansión futura (paquetes ya scaffolded, vacíos)

- [ ] `packages/design-system` — tokens base (spacing, tipografía, sombras)
- [x] ~~`packages/theming`~~ — poblado en el Plan 11 (tokens + `ThemeStyleTag`), pero solo con un tema fijo ("Adrenalina Xtreme"). Sigue pendiente: motor de resolución dinámica de `TemaOrganizacion` por variables CSS.
- [x] ~~`packages/ui`~~ — arrancado en el Plan 9 (`Button`/`Input`/`Badge`/`Sidebar`), sumó `LogoBadge` en el Plan 11; se sigue poblando a medida que salgan más pantallas.
- [ ] `packages/config` — presets compartidos de tsconfig/eslint/tailwind
- [ ] `packages/domain-custom` — casos de uso a medida por cliente (solo cuando exista un cliente real que lo pida)

---

## Notas de mantenimiento (no son tareas, son recordatorios operativos)

- Después de cualquier cambio a `packages/db/prisma/schema.prisma`, correr `npx prisma migrate dev` (o `npx prisma generate` si la migración ya está aplicada) en cada máquina — el cliente generado no se versiona.
- `packages/db/Dockerfile.migrate` sigue en el repo (temporal, para correr migraciones desde un servidor con red hacia la DB) — se puede borrar cuando se confirme que ya no hace falta.
- Para vaciar los datos de prueba de Miembro (y Pago/CheckIn/Suscripcion asociados) sin tocar Plan/Sucursal/UsuarioAdmin: `npm run db:limpiar-miembros --workspace packages/db`.
