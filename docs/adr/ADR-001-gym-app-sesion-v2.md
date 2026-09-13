# ADR-001: Auditoría y Estrategia de Refactorización — Gym-App → SaaS Multi-tenant (v2)

**Proyecto:** gym-app (kaiserone01/gym-app)
**Fecha de la sesión original:** 2026-09-12
**Fecha de esta revisión:** 2026-09-12
**Estado:** Diseño en curso — sin código de implementación escrito, sin commits, sin migraciones ejecutadas.

> ⚠️ **Nota de esta revisión:** esta sesión de refinamiento **no tuvo acceso al repositorio real `kaiserone01/gym-app`** (no hay conector de GitHub habilitado ni salida de red en este sandbox). Todo lo aquí resuelto es una revisión lógica/arquitectónica del documento original, no una re-verificación contra el código. Ver sección 12 para el detalle de esta limitación y cómo cerrarla.

---

## Índice

0–11. *(sin cambios de fondo respecto a la v1 — ver documento original para el detalle completo de la auditoría, hallazgos y decisiones ya tomadas)*
**12. Limitación de esta revisión (acceso al repositorio)**
**13. Huecos cerrados en esta revisión**
**13.1. Modelo de Plan / Membresía / Acceso a Sucursales**
**13.2. Modelo de Roles (RBAC)**
**13.3. Traza de auditoría para extensiones manuales**
**13.4. Idempotencia real del check-in**
**13.5. Fuente de la API BCV — opciones concretas**
**14. Inconsistencias y riesgos detectados en la v1**
**15. Plan de Acción actualizado**

---

## 12. Limitación de esta revisión (acceso al repositorio)

- Se intentó localizar `kaiserone01/gym-app` para contrastar el ADR contra el código real; la búsqueda no devolvió el repositorio (puede ser privado, haber cambiado de nombre/owner, o el clon original haberse hecho en un contexto que esta sesión no puede reproducir).
- No hay ningún conector de GitHub habilitado en esta sesión ni acceso de red saliente desde el sandbox de este chat.
- **Consecuencia:** los hallazgos de la sección 3 (tabla de severidad, `AGENTS.md`, schema real) se tratan aquí como **insumos válidos pero no re-verificados**. Antes de ejecutar el Paso 1 del plan de acción, se recomienda re-confirmar contra el repo real (ver sección 15, paso 0).

---

## 13. Huecos cerrados en esta revisión

Estas son las 5 preguntas abiertas listadas en la sección 10 de la v1. Se proponen respuestas concretas, marcadas como **propuesta para aprobación**, no como decisiones ya tomadas por el usuario.

### 13.1 Modelo de Plan / Membresía / Acceso a Sucursales

**Problema que resuelve:** la v1 dejó dicho que "el plan determina el acceso a sucursales" pero no modeló la relación.

**Propuesta:**

```prisma
model Plan {
  id             String   @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  nombre         String   // "Sede Única", "VIP Multi-sede"
  tipoAcceso     TipoAccesoPlan
  precioUSD      Decimal  @db.Decimal(10, 2)
  activo         Boolean  @default(true)

  suscripciones  Suscripcion[]
  sucursalesAcceso PlanSucursalAcceso[] // solo relevante si tipoAcceso = SEDE_UNICA o LISTA_CERRADA
}

enum TipoAccesoPlan {
  SEDE_UNICA       // acceso a 1 sola sucursal, definida en PlanSucursalAcceso
  LISTA_CERRADA    // acceso a un subconjunto explícito de sucursales
  TODA_LA_ORGANIZACION // "VIP Multi-sede": acceso a todas las sucursales actuales y futuras
}

model PlanSucursalAcceso {
  planId     String
  sucursalId String
  plan       Plan     @relation(fields: [planId], references: [id])
  sucursal   Sucursal @relation(fields: [sucursalId], references: [id])

  @@id([planId, sucursalId])
}

model Suscripcion {
  id         String   @id @default(cuid())
  miembroId  String
  miembro    Miembro  @relation(fields: [miembroId], references: [id])
  planId     String
  plan       Plan     @relation(fields: [planId], references: [id])
  inicio     DateTime
  fin        DateTime
  estado     EstadoSuscripcion @default(ACTIVA)
  createdAt  DateTime @default(now())
}

enum EstadoSuscripcion {
  ACTIVA
  VENCIDA
  CANCELADA
  PAUSADA
}
```

**Regla de validación en el caso de uso `ValidarAccesoSucursalPorPlan`:**
1. Buscar la `Suscripcion` ACTIVA vigente del `Miembro` (por fecha, no solo por estado).
2. Resolver el `Plan.tipoAcceso`:
   - `TODA_LA_ORGANIZACION` → válido para cualquier `Sucursal` de la misma `Organizacion`.
   - `SEDE_UNICA` / `LISTA_CERRADA` → válido solo si la `Sucursal` del check-in está en `PlanSucursalAcceso`.
3. Si no hay suscripción activa → el check-in se registra igual (para no bloquear operación física), pero con `estadoAlMomento = "VENCIDO"` (esto ya es consistente con el campo snapshot histórico que la v1 confirmó que existe en `CheckIn`).

### 13.2 Modelo de Roles (RBAC)

**Problema que resuelve:** la v1 lo dejaba como pregunta abierta desde la auditoría inicial (sección 2.3).

**Propuesta mínima (sin sobre-ingeniería — enum, no tabla de permisos granular todavía):**

```prisma
model UsuarioAdmin {
  id             String   @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  sucursalId     String?  // null = acceso a toda la organización (dueño/gerente general)
  sucursal       Sucursal? @relation(fields: [sucursalId], references: [id])
  rol            RolUsuario
  email          String   @unique
  passwordHash   String
  createdAt      DateTime @default(now())
}

enum RolUsuario {
  DUENO         // acceso total a la Organización, todas las sucursales
  GERENTE       // administra 1+ sucursales asignadas
  RECEPCION     // solo check-in, cobros y consulta de estado de miembros
  ENTRENADOR    // acceso de solo lectura a su cartera de miembros asignados
}
```

Puerto de dominio asociado: `IAuthorizationService` (no `IPermissionRepository` todavía — se evita modelar una matriz de permisos hasta que un segundo caso de uso real lo exija; graduar solo si aparece necesidad de permisos granulares por acción).

### 13.3 Traza de auditoría para extensiones manuales

**Problema que resuelve:** vencimientos extendidos a mano sin quién/cuándo/por qué (detectado en la auditoría inicial, sección 2.3, y repetido como pendiente en la sección 10).

**Propuesta:**

```prisma
model RegistroAuditoria {
  id            String   @id @default(cuid())
  entidad       String   // "Suscripcion", "Miembro", etc.
  entidadId     String
  campo         String   // "fin", "estado"
  valorAnterior String
  valorNuevo    String
  motivo        String
  usuarioId     String
  usuario       UsuarioAdmin @relation(fields: [usuarioId], references: [id])
  createdAt     DateTime @default(now())
}
```

Se escribe **solo** desde el caso de uso `ExtenderSuscripcionManualmente` (nunca directo desde un route handler) — mismo patrón hexagonal ya definido para el resto del dominio.

### 13.4 Idempotencia real del check-in

**Problema que resuelve:** hallazgo 🟠 confirmado en la auditoría real (sección 3.1): doble `POST` duplica el registro.

**Propuesta (sin tabla nueva, resuelto en el caso de uso):**
`RegistrarCheckIn` rechaza (o responde con el check-in existente, sin crear uno nuevo — a decidir con el usuario) si ya existe un `CheckIn` del mismo `miembroId` + `sucursalId` dentro de una ventana de **N minutos** (configurable, sugerido 2 min como valor por defecto). No requiere migración adicional: es una query de existencia antes del `create`, dentro del caso de uso — coherente con la regla arquitectónica de la sección 5 (el dominio decide, la infraestructura solo persiste).

### 13.5 Fuente de la API BCV — opciones concretas

**Problema que resuelve:** la v1 dejó "confirmar fuente exacta" como pregunta abierta (sección 10).

Opciones típicas usadas en el ecosistema de tasas VES (a validar con el usuario, ninguna se asume como decisión final):
- API no oficial que replica el BCV (ej. servicios tipo `pydolarve`/`dolarapi` — múltiples proyectos comunitarios ofrecen esto con distintos SLA).
- Scraping directo de la página oficial del BCV como fallback de última instancia (frágil ante cambios de HTML — no recomendado como fuente primaria).

Esto queda igual como **pregunta abierta para el usuario** — no se fija proveedor aquí; solo se documentan las categorías de opción para que la decisión sea informada.

---

## 14. Inconsistencias y riesgos detectados en la v1

| # | Observación | Severidad | Recomendación |
|---|---|---|---|
| 1 | `TemaOrganizacion` está definida a nivel `Organizacion`, pero la sección 8 habla de "theming por gimnasio" sin aclarar si una `Sucursal` puede tener marca propia. | 🟡 Aclaración | Confirmar explícitamente: theming es por `Organizacion` únicamente (una marca, N sucursales visualmente iguales) — si se necesita override por sucursal, es un campo nuevo, no una reinterpretación del actual. |
| 2 | El modelo conceptual de la sección 6 no incluía `Plan`/`Suscripcion` pese a que la sección 4.1 ya los menciona como concepto central. | 🟠 Hueco de diseño | Cerrado en la sección 13.1 de este documento. |
| 3 | `Entrenador` sigue colgando implícitamente de `Gym` (modelo viejo) sin relación explícita a `Sucursal` en el nuevo esquema. | 🟡 Pendiente | Definir si un `Entrenador` pertenece a una `Sucursal` fija o, como el `Miembro`, a la `Organizacion` con acceso a varias sedes. |
| 4 | El Paso 1 del plan de acción (sección 9) no incluye un paso de **re-verificación contra el repo real** antes de mover código. | 🟠 Riesgo de ejecución | Añadido como paso 0 en la sección 15 de este documento. |
| 5 | No hay mención de qué pasa con `bcryptjs`/login del panel admin (nota 🟡 de la sección 3.1) en el plan de acción. | 🟡 Pendiente | No bloquea el Paso 1 (scaffolding), pero debe entrar en el plan antes de exponer `apps/web-admin` fuera de un entorno de confianza. |

---

## 15. Plan de Acción actualizado

0. **(Nuevo)** Re-clonar/re-verificar `kaiserone01/gym-app` contra los hallazgos de la sección 3 antes de mover una sola línea de código — confirmar que el schema y el endpoint no cambiaron desde la auditoría original.
1. Instalar `turbo` como devDependency en la raíz; crear `turbo.json` mínimo (pipelines `build`/`dev`/`lint` heredados).
2. Convertir el `package.json` raíz en workspace root (`"workspaces": ["apps/*", "packages/*"]`).
3. Mover el contenido actual completo de `gym-app` (tal cual, sin tocar código interno) a `apps/web-admin/`.
4. Eliminar `AGENTS.md` (comando sugerido, no ejecutado: `git rm AGENTS.md`).
5. Crear las carpetas vacías de la topología ya definida en la v1 (sección 5).
6. Validar que `npm run build` sigue funcionando desde la raíz vía Turborepo, sin cambio de comportamiento.
7. **(Nuevo)** Antes de escribir `schema.prisma` definitivo: someter a aprobación explícita del usuario los modelos `Plan`, `Suscripcion`, `PlanSucursalAcceso`, `UsuarioAdmin` (con rol) y `RegistroAuditoria` propuestos en la sección 13 de este documento — ninguno se implementa todavía.

Ningún paso de esta lista toca `schema.prisma` ni ejecuta migraciones.

---

## 16. Preguntas que siguen abiertas tras esta revisión

- ¿`Entrenador` pertenece a una `Sucursal` fija o a la `Organizacion` (con asignación a miembros, no a sede)?
- ¿Doble check-in dentro de la ventana de idempotencia debe **rechazarse** (error 409) o **responder silenciosamente** con el check-in existente?
- ¿`TemaOrganizacion` admite override visual por `Sucursal` en el futuro, o es una regla dura de una sola marca por Organización?
- Confirmar proveedor final de la API BCV (sección 13.5).
- ¿El rol `GERENTE` puede crear/editar `UsuarioAdmin` de rol `RECEPCION`, o esa capacidad es exclusiva de `DUENO`?
