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
- [x] Ajuste post-prueba: número de operación pedido para todos los métodos bancarios (Pago Móvil, Transferencia, Zelle, Binance/USDT), no solo Pago Móvil + columna "Monto (Bs)" en la tabla de `/caja` (tasa fija de prueba).
- [x] Ajuste post-prueba (según audio del dueño): `METODOS_PAGO` desglosado por banco/canal real — Pago Móvil, Transferencia Banco de Venezuela, Transferencia Banco Mercantil, Punto Banesco, BioPago de Venezuela, Punto Banco del Tesoro, Transferencia (otro banco), Zelle, Binance/USDT — en vez del "Transferencia" genérico único de antes. El desglose de `/caja` ahora cruza banco/método × tipo de plan (cantidad y monto por cada combinación, ej. "3 Mensual sin entrenador — $75.00"), infiriendo el tipo de plan del precio actual del `Miembro` contra el catálogo de `planesPreset.ts` (sin match ⇒ "Personalizado"). Nota: como el tipo de plan no se guarda en el `Pago` en sí, un miembro que cambió de plan después de pagar se muestra con su plan *actual*, no el vigente al momento de ese pago puntual — decisión explícita, ver pregunta de diseño abajo.
- [x] Verificado sin DB: `tsc --noEmit`, `turbo run build`/`lint` en `web-admin` (y `kiosk`, sin regresión)
- [x] **Verificado por el usuario:** `/caja` probada en el navegador contra la base real (pago con Pago Móvil, desglose por método, cierre del día) — esto fue **antes** de los dos ajustes de arriba (número de operación por método, desglose por banco × plan), que todavía no tienen verificación del usuario.
- Diferido explícitamente: cierre de caja por Sucursal (hoy `Pago` no tiene noción de sucursal), restringir quién puede cerrar caja (matriz de permisos), bloquear pagos con fecha dentro de un día ya cerrado, exportar a PDF/Excel real, editar/anular un `CierreCaja` ya creado, guardar el tipo de plan en el propio `Pago` para que el reporte sea histórico en vez de usar el plan actual del `Miembro`.

### Plan 13 — Turnos de Caja, Arqueo y Egresos (reemplaza el Cierre de Caja del Plan 12)
- [x] Rediseño completo del modelo de caja: reemplaza el "cierre global diario" del Plan 12 por un flujo real de **turnos por cajero/sucursal** — apertura explícita con fondo inicial (USD/Bs), cobro asociado automáticamente al turno abierto de la sucursal, egresos registrados por el cajero durante el turno, y cierre con **arqueo por método de pago** (monto esperado calculado por el sistema vs. monto contado, con nota obligatoria solo si hay diferencia).
- [x] Modelos nuevos `Turno`, `Egreso`, `ArqueoLinea` (+ enums `EstadoTurno`/`MonedaEgreso`); `Pago` extendido con `sucursalId`, `turnoId` (null = ajuste fuera de turno), `registradoPorId`, y campos de anulación (`anuladoEn`/`anuladoPorId`/`motivoAnulacion` — un pago nunca se borra, solo se anula con motivo); `CierreCaja` eliminado del schema (los datos existentes eran de prueba, se limpiaron antes de migrar).
- [x] Dominio: `AbrirTurno`, `RegistrarEgreso`, `ObtenerResumenTurno`, `CerrarTurno` (recalcula el esperado server-side, nunca confía en el cliente), `AnularPago` (solo DUEÑO/GERENTE, ni siquiera RECEPCION); `RegistrarPago` y `ObtenerReporteCaja` reescritos para turnos. Matriz de permisos aplicada por primera vez a este módulo: ENTRENADOR no puede abrir/cerrar turno, registrar egreso, ni registrar pago.
- [x] Los 3 consumidores de `registrarPago` actualizados a la nueva firma (turno/sucursal/rol derivados siempre de la sesión, nunca del cliente): `/pagos/nuevo`, el pago inicial de "Nuevo Miembro", y `POST /api/pagos`.
- [x] Pantalla `/caja` rediseñada: "Abrir turno" cuando no hay uno activo en la sucursal, "Turno activo" (resumen por método, alta de egresos, arqueo de cierre) cuando sí lo hay, y reporte histórico agrupado por turno con sección aparte para "ajustes fuera de turno".
- [x] Ejecutado con `subagent-driven-development`: 10 tareas de código + verificación, cada una con implementer y reviewer dedicados. Durante la ejecución se detectó y corrigió un gap real del plan (la Tarea de actualizar `registrarPago` solo cubría 1 de 3 consumidores reales en el repo — se amplió antes de implementar).
- [x] Verificado: `npx tsc --noEmit` limpio en `apps/web-admin`, `npx turbo run build --filter=web-admin` exitoso con todas las rutas esperadas (incluida `/caja`).
- Pendiente (detectado durante las revisiones, no bloqueante, requiere una mini-tarea de UI aparte): **selector de sucursal para un DUEÑO sin `sucursalId` fija** — hoy, si un usuario sin sucursal asignada (típicamente un DUEÑO multi-sede) intenta abrir turno o registrar un pago, el sistema pide seleccionar sucursal pero el `<select>` correspondiente está hardcodeado vacío (`sucursales={[]}`) — no hay forma de completarlo. No afecta el flujo normal de RECEPCION/GERENTE con sucursal fija.
- Pendiente (mismo motivo): **botón de anulación de pago en la UI** — el caso de uso `AnularPago` y su Server Action (`anularPagoAction`) están completos y probados, pero la pantalla mínima de `/caja` construida en este plan no expone un botón para invocarla desde el reporte histórico.
- Pendiente explícito del usuario (Task 18 equivalente de este plan): **probar en el navegador contra la base real** — abrir turno, registrar pagos y egresos, cerrar con y sin diferencia (confirmando que la nota se vuelve obligatoria solo cuando corresponde), y confirmar que un segundo intento de abrir turno en la misma sucursal falla correctamente.
- Sigue abierta la misma pregunta de producto del Plan 12: ¿`RegistrarPago` debería rechazar pagos contra un `Miembro` inactivo?

### Plan 14 — Administración de Organización (Sucursales, Usuarios, Permisos granulares)
- [x] CRUD de `Sucursal` completo desde la UI: pantallas `/sucursales`, `/sucursales/nuevo`, `/sucursales/[id]` (alta, edición, baja/reactivación), casos de uso `CrearSucursal`/`ActualizarSucursal` sumados a `ListarSucursales` (Plan 10).
- [x] CRUD de `UsuarioAdmin` completo desde la UI: pantallas `/usuarios`, `/usuarios/nuevo`, `/usuarios/[id]`, con casos de uso `ListarUsuarios`/`ObtenerUsuario`/`ActualizarUsuario`/gestión de sucursales y permisos.
- [x] Editor de permisos granular por usuario (matriz de checkboxes por módulo/acción) + modelo N:N `UsuarioSucursal` para asignar un usuario a una o varias sucursales (reemplaza la `sucursalId` única implícita).
- [x] `AuthorizationService` migrado de chequeos por rol (`rol === "DUENO"`) a `tienePermiso(usuario, modulo, accion)` contra la matriz granular — cierra el pendiente "Matriz de permisos granular" que quedaba abierto en 🟡 desde el Plan 3.
- [x] 5 casos de uso migrados a la nueva firma de `tienePermiso`/`AuthorizationService` (`CrearUsuarioAdmin` y los 4 que ya usaban chequeo de rol) — verificado que ningún consumidor quedó en la firma vieja.
- [x] Verificado (con `--force` para descartar cachés obsoletas): `cd apps/web-admin && npx tsc --noEmit` limpio, `npx turbo run build --filter=web-admin` exitoso con las 6 rutas nuevas esperadas (`/sucursales`, `/sucursales/nuevo`, `/sucursales/[id]`, `/usuarios`, `/usuarios/nuevo`, `/usuarios/[id]`, bajo el route group `(panel)`) y las 27 rutas totales del monorepo compilando sin errores.
- **Gap real, explícitamente fuera de alcance:** `ValidarSesion` no chequea `UsuarioAdmin.activo` hoy — dar de baja un usuario no bloquea su sesión/login existente. La spec de este plan definió "gestión de usuarios" como CRUD + permisos, sin tocar el flujo de login/sesión, así que esto no se corrigió acá. Queda documentado como pendiente explícito (ver 🟡 abajo).
- **Regresión de build detectada y corregida antes del cierre del plan:** los cambios de contrato de la Tarea 2 (`IUsuarioAdminRepository.buscarPorId` ahora requiere `organizacionId`; `Sucursal` ganó campos requeridos `direccion`/`diasGracia`/`activo`) rompían dos consumidores que ninguna tarea tenía en su lista de archivos: `packages/domain/use-cases/ValidarSesion.ts` (llamaba a `buscarPorId` con un solo argumento) y `packages/infrastructure/auth/KioskTokenValidator.ts` (construía un `Sucursal` incompleto). Se agregó `IUsuarioAdminRepository.buscarPorIdSinOrganizacion(id)` — deliberadamente sin scope de organización, igual que el ya existente `buscarCredencialesPorEmail`, porque `ValidarSesion` resuelve la identidad del usuario antes de conocer su organización — y se completaron los campos faltantes en `KioskTokenValidator`. El `buscarPorId(organizacionId, id)` con scope de seguridad existente no se tocó. Verificado con revisión de código dedicada centrada en que el nuevo método no scopeado no se usa fuera de `ValidarSesion`.
- Pendiente explícito del usuario: **prueba manual end-to-end en el navegador** con un DUEÑO real (crear/editar/dar de baja sucursal, crear RECEPCION con permisos por defecto, editar permisos y confirmar el bloqueo real, crear GERENTE multi-sucursal, confirmar el redirect de `/usuarios` sin `USUARIOS.VER`, y confirmar el gap de `activo` en login) — no se pudo ejecutar en esta verificación por no tener acceso a navegador ni a un usuario logueado real.

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
- [x] ~~Matriz de permisos granular~~ — Plan 14, completo: `AuthorizationService.tienePermiso` + editor de permisos por usuario en `/usuarios/[id]`.
- [ ] **`ValidarSesion` no chequea `UsuarioAdmin.activo`** — dar de baja un usuario (Plan 14) no bloquea su sesión/login existente todavía. Detectado en el Plan 14, explícitamente fuera de su alcance (la spec no mencionaba login/sesión).
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
