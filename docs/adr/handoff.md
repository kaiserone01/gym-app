# Handoff — gym-app

## Objetivo
Revisar y perfeccionar `ADR-001-gym-app-sesion.md` (auditoría y estrategia de refactorización hacia SaaS multi-tenant), cerrando las preguntas abiertas que había dejado la sesión anterior.

## Estado actual
- No se tocó código ni `schema.prisma`. No se ejecutaron migraciones, builds ni comandos de Prisma.
- Se produjo `ADR-001-gym-app-sesion-v2.md`, que añade a la v1:
  - Modelo `Plan` / `Suscripcion` / `PlanSucursalAcceso` para resolver el acceso multi-sucursal por membresía.
  - Modelo de roles (`UsuarioAdmin.rol`, enum `RolUsuario`) para la futura delegación a empleados.
  - `RegistroAuditoria` para trazar extensiones manuales de vencimiento.
  - Regla concreta de idempotencia para `RegistrarCheckIn` (ventana de N minutos).
  - Categorías de opción para la fuente de la API BCV (sin fijar proveedor).
  - Tabla de 5 inconsistencias/riesgos detectados en la v1.
  - Paso 0 nuevo en el plan de acción: re-verificar el repo real antes de mover código.

## Archivos y cambios
- **Creado (fuera del repo, en el entorno de este chat):** `ADR-001-gym-app-sesion-v2.md`, `handoff.md`.
- **No modificado:** ningún archivo del repositorio real `kaiserone01/gym-app` (sin acceso a él en esta sesión).
- **Acción pendiente del usuario:** copiar `ADR-001-gym-app-sesion-v2.md` a la raíz del repo (o fusionar su contenido nuevo dentro del `ADR-001-gym-app-sesion.md` existente) y este `handoff.md` también a la raíz.

## Intentos fallidos
- Se intentó localizar y leer el repositorio `kaiserone01/gym-app` (vía búsqueda web) para re-verificar los hallazgos de la auditoría contra el código real: **no se encontró el repositorio** desde este entorno (sin conector de GitHub habilitado, sin salida de red en el sandbox).

## Próximos pasos
1. Conectar una herramienta con acceso real a GitHub (o subir los archivos del repo directamente al chat) para re-verificar `prisma/schema.prisma`, `app/api/checkin/route.ts` y `AGENTS.md` contra los hallazgos de la sección 3 del ADR.
2. Obtener aprobación explícita del usuario sobre los modelos nuevos propuestos en la sección 13 de la v2 (`Plan`, `Suscripcion`, `PlanSucursalAcceso`, `UsuarioAdmin.rol`, `RegistroAuditoria`) antes de tocar `schema.prisma`.
3. Resolver las 5 preguntas de la sección 16 de la v2 (relación `Entrenador`↔`Sucursal`, comportamiento ante doble check-in, alcance del theming, proveedor BCV, permisos de `GERENTE`).
4. Solo después de 1–3: ejecutar el Paso 1 del plan de acción (scaffolding de Turborepo), siguiendo el orden ya definido en la sección 15.
