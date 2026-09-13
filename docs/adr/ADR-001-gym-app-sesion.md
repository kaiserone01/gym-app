# ADR-001: Auditoría y Estrategia de Refactorización — Gym-App → SaaS Multi-tenant

**Proyecto:** gym-app (kaiserone01/gym-app)
**Fecha de la sesión:** 2026-09-12
**Estado:** Diseño en curso — sin código de implementación escrito, sin commits, sin migraciones ejecutadas.

---

## Índice

0. Contexto y reglas del proyecto
1. Directiva original (auditoría profunda y hard refactor)
2. Auditoría inicial (previa al acceso al repositorio)
3. Auditoría real (tras clonar `kaiserone01/gym-app`)
4. Decisiones de producto resueltas en esta sesión
5. ADR-001 definitivo — Topología de carpetas
6. Modelo de datos conceptual (schema)
7. Modelo Venezuela / API BCV — flujo
8. Design System multi-marca (theming por gimnasio)
9. Plan de Acción — detalle del Paso 1
10. Preguntas abiertas / pendientes de confirmación
11. Estado del repositorio

---

## 0. Contexto y reglas del proyecto

- **Idioma/razonamiento:** todo el procesamiento interno en español; toda explicación previa a ejecutar comandos, leer archivos o escribir código sigue la estructura: Evaluación de Impacto → Resolución de Conflictos → Mentoría Técnica → Plan de Acción.
- **Git:** nunca se ejecuta `commit`/`push`/PR automáticamente. El working tree queda con los cambios; los mensajes de commit se sugieren en Conventional Commits (español).
- **Entregables temporales:** no se crean `SUMMARY.md`/`REPORT.md`. Al cerrar sesión se genera/actualiza `handoff.md` (Objetivo, Estado actual, Archivos y cambios, Intentos fallidos, Próximos pasos).
- **Prisma:** modificar solo `schema.prisma`, correr `npx prisma format` + `npx prisma validate`, migrar con `npx prisma migrate dev --name <nombre>`, actualizar `seed.ts` si aplica. Nunca tocar el motor de base de datos a mano.
- **MCP Tools:** prohibido usar Chrome DevTools MCP salvo pedido explícito.
- **Stack confirmado:** Next.js (App Router) + TypeScript, PostgreSQL + Prisma (v7, con `@prisma/adapter-pg` y cliente generado en `app/generated/prisma`), Tailwind CSS, ESLint, despliegue en VPS Hostinger vía Docker/EasyPanel, npm como package manager.

---

## 1. Directiva original (auditoría profunda y hard refactor)

Documento de entrada de la sesión: instrucción para actuar como Principal Software Architect, cuestionar el estado actual de `gym-app` antes de escribir código, y producir un ADR cubriendo:

1. Auditoría de código y estado actual (vulnerabilidades, Prisma vs. Drizzle, ambigüedades).
2. Re-arquitectura hacia monorepo (Turborepo): topología de workspaces y configuración compartida.
3. Resolución del caso de uso físico del kiosco (PWA vs. Tauri/Electron vs. React Native/Expo).
4. Plan de escalabilidad (pagos, membresías escalonadas, reservas, inventario).

Con la instrucción explícita de no tocar código todavía y cerrar con un Plan de Acción paso a paso.

---

## 2. Auditoría inicial (previa al acceso al repositorio)

Elaborada solo con el contexto documentado del proyecto (sin ver código todavía):

### 2.1 Riesgos previstos en `/api/checkin`
- Posible falta de idempotencia ante doble check-in.
- Latencia/timeout sin manejo explícito ante intermitencia de red entre el kiosco (LAN del gym) y el VPS remoto.
- Validación de la cédula sin confirmar.
- Posibles queries no optimizadas en el cálculo de estado al día/vencido.

### 2.2 Prisma vs. Drizzle
Recomendación: **quedarse con Prisma**, introducir una capa de repositorio para desacoplar el acceso a datos de los route handlers — eso es lo que realmente habilita un cambio de ORM futuro, no la migración en sí.

### 2.3 Ambigüedades detectadas
- Qué pasa si el kiosco pierde conexión.
- Falta de modelo de roles para la futura delegación a empleados.
- Extensiones manuales de vencimiento sin traza de auditoría (quién, cuándo, por qué).

### 2.4 Topología Turborepo propuesta (versión inicial)
```
apps/{web-admin, kiosk}
packages/{db, domain, ui, config}
```
Con nota de arquitecto: dado que había un solo tenant activo en ese momento, se advirtió sobre el riesgo de sobre-ingeniería — advertencia que quedó superada al confirmarse en el punto 4 que el producto es, efectivamente, un SaaS multi-tenant.

### 2.5 Módulo Kiosko (análisis inicial)
Dato clave usado: el kiosco es un **PC con teclado numérico físico**, no una tablet táctil — esto descartó React Native/Expo como opción inmediata.

Comparativa PWA / Tauri / Electron / Expo → recomendación inicial: **PWA ahora**, con lógica de negocio aislada en `packages/domain` para poder envolverla en Tauri más adelante sin reescritura, si se necesita acceso a hardware (RFID, molinetes).

---

## 3. Auditoría real (tras clonar `kaiserone01/gym-app`)

Se clonó el repositorio público en modo **solo lectura**, en un sandbox aislado (sin credenciales de push hacia el repo real), y se revisaron: `prisma/schema.prisma`, `app/api/checkin/route.ts`, `lib/prisma.ts`, `package.json`, `README.md`, `AGENTS.md`/`CLAUDE.md`, `app/page.tsx`, `app/layout.tsx`.

### 3.1 Hallazgos confirmados

| Hallazgo | Severidad | Detalle |
|---|---|---|
| `gymId` viaja en el body del request sin validar sesión | 🔴 Crítico | El endpoint confía ciegamente en el `gymId` enviado por el cliente. En un SaaS multi-tenant real esto es una fuga de datos entre organizaciones. |
| Sin idempotencia en el check-in | 🟠 Medio | Cada `POST` crea un registro `CheckIn` nuevo; un doble Enter duplica el registro. |
| Sin Zod, sin rate limiting, sin tests | 🟠 Medio | Validación manual únicamente; no hay librerías de testing en `package.json`. |
| `bcryptjs` instalado, sin ruta de login visible | 🟡 Nota | El auth del panel admin parece planeado pero no implementado todavía. |
| Doble moneda (USD/Bs) ya implementada, con tasa editable por gym (`tasaCambioUSD`) | 🟢 Info | No estaba contemplado en el análisis inicial; relevante también para el pricing del SaaS. |
| `diasGracia` ya existe como campo configurable (default 0) | 🟢 Confirma lo dicho | No es una regla hardcodeada. |
| Prisma 7 con `@prisma/adapter-pg`, cliente generado en `app/generated/prisma` | 🟢 Confirma recomendación | Refuerza mantener Prisma y abstraer en `packages/db`. |

### 3.2 Nota de seguridad: `AGENTS.md`
El archivo `AGENTS.md` del repo afirmaba ser "regenerado automáticamente por `next dev`" e instruía a leer documentación desde `node_modules/next/dist/docs/` y a comitear el archivo con los cambios. Se identificó como un **patrón de inyección de instrucciones dirigido a agentes de IA** que trabajan sobre el repo. No se siguió ninguna de sus instrucciones. Decisión del usuario: **eliminarlo** (ver sección 4.3).

### Modelo de datos real encontrado (`prisma/schema.prisma` antes de esta sesión)
```prisma
model Gym {
  id            String    @id @default(cuid())
  nombre        String
  diasGracia    Int       @default(0)
  tasaCambioUSD Decimal?  @db.Decimal(10, 2)
  createdAt     DateTime  @default(now())
  usuarios      UsuarioAdmin[]
  entrenadores  Entrenador[]
  miembros      Miembro[]
  pagos         Pago[]
  checkIns      CheckIn[]
}
// + UsuarioAdmin, Entrenador, Miembro (planTipo: SIN_ENTRENADOR | CON_ENTRENADOR),
//   Pago (monto, metodo, tasaCambio), CheckIn (estadoAlMomento snapshot histórico)
```

---

## 4. Decisiones de producto resueltas en esta sesión

### 4.1 SaaS multi-tenant: Organización → Sucursal → Miembro
- El producto será un **SaaS multi-tenant**: varios gimnasios, cada uno con posibles varias sucursales.
- No todos los módulos desarrollados para un cliente puntual forman parte del núcleo del SaaS (ver estrategia core/custom en la topología de la sección 5).
- **Relación confirmada por el usuario:** un `Miembro` pertenece a la **Organización**, no a una sucursal fija. Es el **plan/membresía** el que determina a qué sucursales tiene acceso (ej. plan "Sede Única" vs. plan "VIP Multi-sede"). El registro de **check-in físico siempre queda atado a una Sucursal específica** (el lugar donde ocurrió), independientemente de cuántas sucursales cubra el plan del miembro.

### 4.2 Seguridad del kiosco
Confirmado por el usuario: el `gymId`/`sucursalId` **jamás** debe venir del body del request. El kiosco físico debe tener una variable de entorno local con un **token/API Key de sucursal**, que el backend valida para deducir a qué sucursal pertenece el check-in.

### 4.3 Eliminación de `AGENTS.md`
Decisión del usuario: eliminar el archivo del repositorio. Comando sugerido (no ejecutado): `git rm AGENTS.md`.

### 4.4 Requerimiento Core: Modelo Venezuela + API BCV
- Los precios (lo que el SaaS cobra a los gimnasios, y lo que los gimnasios cobran a sus miembros) se fijan internamente **de forma referencial en USD**.
- Es obligatorio integrar un servicio que consulte **diariamente** la tasa oficial del Banco Central de Venezuela (BCV) vía API.
- El sistema debe mostrar, facturar y registrar pagos equivalentes en **Bolívares (VES) en tiempo real**, basado en esa tasa oficial.

### 4.5 Restricción de arquitectura: Hexagonal (Puertos y Adaptadores)
Exigencia explícita del usuario, justificada por el propio caso del BCV:
- **Dominio (Core):** reglas de facturación, conversión y cobro viven aisladas; consumen un puerto (ej. `IExchangeRateService`), sin saber de dónde viene la tasa.
- **Infraestructura (Adaptadores):** implementaciones concretas — `BcvApiAdapter` hoy, intercambiable mañana por `BinanceP2PAdapter` u otra fuente, sin tocar el dominio.
- **Capa de Aplicación/Web:** Next.js actúa solo como mecanismo de entrada/salida (UI + endpoints HTTP) que invoca casos de uso del dominio.

Nota de mentoría incluida en la sesión: a diferencia de Turborepo (donde se advirtió sobre riesgo de sobre-ingeniería para la escala inicial), Hexagonal **sí se justifica sin ambigüedad** aquí porque existe una dependencia externa genuinamente volátil (la API del BCV).

### 4.6 Design System multi-marca (theming por gimnasio)
Nuevo requerimiento: la UI debe soportar personalización de marca por gimnasio —colores, logo, tipografía, e incluso layouts distintos como presets. Aclaración de diseño incluida en la sesión: **el theming NO es parte del hexágono de dominio** — es una preocupación de presentación, tratada como sistema hermano, no como otro puerto del dominio.

---

## 5. ADR-001 definitivo — Topología de carpetas

```
gym-saas/
├── apps/
│   ├── web-admin/                    # Next.js — solo entrada/salida (UI + route handlers delgados)
│   │   └── app/api/.../route.ts      # recibe request → valida → llama 1 caso de uso → responde
│   ├── kiosk/                        # check-in físico — cero lógica de negocio
│   └── worker/                       # proceso persistente (cron): tasa BCV diaria, recordatorios, etc.
│
├── packages/
│   ├── domain/                       # NÚCLEO HEXAGONAL — cero imports de Next.js/Prisma/HTTP
│   │   ├── entities/                 #   Organizacion, Sucursal, Miembro, Plan, Suscripcion, TasaCambio
│   │   ├── use-cases/                #   RegistrarCheckIn, CalcularEstadoMembresia,
│   │   │                             #   ConvertirMontoUSDaVES, ActualizarTasaDiaria,
│   │   │                             #   CobrarSuscripcionSucursal, ValidarAccesoSucursalPorPlan
│   │   └── ports/                    #   Interfaces implementadas afuera:
│   │       ├── IExchangeRateService
│   │       ├── ITasaCambioRepository
│   │       ├── IMemberRepository
│   │       ├── ISucursalRepository
│   │       ├── IKioskAuthValidator
│   │       └── IPaymentGateway       #   placeholder para integraciones de pago futuras
│   │
│   ├── domain-custom/
│   │   └── <cliente-slug>/           #   casos de uso bespoke; custom → core, nunca al revés
│   │
│   ├── infrastructure/               # ADAPTADORES — únicos que hacen fetch HTTP o tocan Prisma
│   │   ├── exchange-rate/
│   │   │   ├── BcvApiAdapter
│   │   │   ├── BinanceP2PAdapter     #   mismo puerto, fuente alternativa
│   │   │   └── ExchangeRateCache     #   decorator: cachea la tasa del día
│   │   ├── persistence/prisma/
│   │   │   ├── PrismaMemberRepository
│   │   │   ├── PrismaSucursalRepository
│   │   │   └── PrismaTasaCambioRepository
│   │   └── auth/
│   │       └── KioskTokenValidator   #   implementa IKioskAuthValidator
│   │
│   ├── db/                           #   solo schema.prisma + cliente generado (sin lógica)
│   ├── design-system/                #   tokens base: spacing, radii, escala tipográfica, sombras
│   ├── theming/                      #   motor de resolución de tema por Organización
│   ├── ui/                           #   componentes React que consumen tokens/tema vía CSS variables
│   └── config/                       #   tsconfig, eslint, tailwind preset compartidos
│
├── turbo.json
└── package.json
```

**Regla arquitectónica dura:** `packages/domain` no importa nada de `packages/infrastructure`, ni de Next.js, ni de Prisma directamente. `apps/web-admin`, `apps/kiosk` y `apps/worker` deciden, por inyección simple, qué adaptador concreto usar detrás de cada puerto.

**Regla de graduación custom → core:** si 2+ clientes piden el mismo módulo custom, se promueve de `domain-custom/<cliente>` a `domain/`.

---

## 6. Modelo de datos conceptual (schema)

> Sketch de diseño para discusión — ninguna migración fue ejecutada.

```prisma
model Organizacion {
  id        String   @id @default(cuid())
  nombre    String
  slug      String   @unique
  plan      String   @default("basico")
  createdAt DateTime @default(now())

  sucursales    Sucursal[]
  usuariosAdmin UsuarioAdmin[]
  miembros      Miembro[]          // el Miembro cuelga de la Organización (decisión 4.1)
}

model Sucursal {
  id             String       @id @default(cuid())
  organizacionId String
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id])
  nombre         String
  direccion      String?
  diasGracia     Int          @default(0)
  tasaCambioUSD  Decimal?     @db.Decimal(10, 2)   // override manual / fallback local
  createdAt      DateTime     @default(now())

  entrenadores Entrenador[]
  checkIns     CheckIn[]      // el CheckIn siempre queda atado a la Sucursal física (decisión 4.1)
}

// El Plan/Membresía del Miembro determina a qué Sucursal(es) tiene acceso
// (ej. "Sede Única" vs. "VIP Multi-sede") — a definir en detalle en la siguiente ronda.

model TasaCambio {
  id        String   @id @default(cuid())
  fecha     DateTime @unique   // día calendario
  valor     Decimal  @db.Decimal(12, 4)
  fuente    String   // "BCV" | "BINANCE_P2P" | "MANUAL"
  createdAt DateTime @default(now())
}

model TemaOrganizacion {
  organizacionId String   @id
  colorPrimario  String
  colorSecundario String?
  logoUrl        String?
  fuenteId       String   @default("inter")       // catálogo curado, no texto libre
  layoutPreset   String   @default("clasico")     // "clasico" | "moderno" | "compacto"
}
```

---

## 7. Modelo Venezuela / API BCV — flujo

- El campo `Sucursal.tasaCambioUSD` (ya existente) **no desaparece**: pasa a ser el *fallback* manual (API del BCV caída, o el dueño fija una tasa propia para una transacción puntual).
- `TasaCambio` es una tabla de histórico **a nivel plataforma** (la tasa oficial es una sola a nivel nacional, no por sucursal).
- `Pago.tasaCambio` (ya existente) sigue guardando la tasa efectivamente usada en cada transacción puntual — ese diseño ya estaba bien resuelto.
- **Flujo diario:** `apps/worker` dispara el caso de uso `ActualizarTasaDiaria` → llama al puerto `IExchangeRateService` → hoy resuelve a `BcvApiAdapter` → si falla, cae al último valor cacheado en `ExchangeRateCache` y registra advertencia, **sin bloquear el check-in físico del kiosco**.

---

## 8. Design System multi-marca — detalle

- `packages/design-system`: base que no cambia por cliente (spacing, radii, tipografía base, sombras) — la "constitución visual".
- `TemaOrganizacion`: colores, logo, tipografía y layout preset resueltos server-side e inyectados como variables CSS (`--color-primario`, `--color-secundario`) en el layout raíz de `apps/web-admin` y `apps/kiosk`.
- `packages/ui` nunca hardcodea un color — todo componente consume las variables del tema activo.
- Tipografía: catálogo curado (no upload libre de fuentes) — controla performance y licencias.
- Layouts: enum finito de presets (`clasico | moderno | compacto`), no un editor visual arbitrario — mantiene el sistema soportable. Un layout realmente distinto es candidato a `domain-custom`/nuevo preset agregado al catálogo, no a CSS libre por cliente.

---

## 9. Plan de Acción — detalle del Paso 1

**Aclaración de alcance:** el clon del repositorio usado para auditar vive en un sandbox aislado, sin credenciales de push hacia GitHub. Ejecutar el Paso 1 implica construir el scaffolding para que el usuario lo baje/mergee, o entregar la secuencia exacta de comandos para correr localmente — no una escritura directa sobre `kaiserone01/gym-app`.

Orden exacto, sin escribir lógica de negocio todavía:

1. Instalar `turbo` como devDependency en la raíz; crear `turbo.json` mínimo (pipelines `build`/`dev`/`lint` heredados).
2. Convertir el `package.json` raíz en workspace root (`"workspaces": ["apps/*", "packages/*"]`).
3. Mover el contenido actual completo de `gym-app` (tal cual, sin tocar código interno) a `apps/web-admin/`.
4. Eliminar `AGENTS.md` (comando sugerido: `git rm AGENTS.md`).
5. Crear las carpetas vacías de la topología: `packages/domain/{entities,use-cases,ports}`, `packages/domain-custom`, `packages/infrastructure/{exchange-rate,persistence/prisma,auth}`, `packages/db`, `packages/design-system`, `packages/theming`, `packages/ui`, `packages/config`.
6. Validar que `npm run build` sigue funcionando desde la raíz vía Turborepo, sin cambio de comportamiento.

Ningún paso de esta lista toca `schema.prisma` ni crea `TasaCambio`/`TemaOrganizacion` todavía.

---

## 10. Preguntas abiertas / pendientes de confirmación

- Definir en detalle el modelo de **Plan/Membresía** que determina el acceso multi-sucursal ("Sede Única" vs. "VIP Multi-sede") — cómo se relaciona exactamente con `Organizacion`, `Sucursal` y `Miembro`.
- Definir el modelo de roles para la futura delegación a empleados (pendiente desde la auditoría inicial).
- Definir traza de auditoría para extensiones manuales de vencimiento.
- Confirmar fuente(s) exacta(s) de la API del BCV a integrar en `BcvApiAdapter` (endpoint, formato, frecuencia de cambio del formato de respuesta).
- Definir nombres finales de casos de uso y contratos de los puertos antes de escribir una sola interfaz real.

---

## 11. Estado del repositorio

- Repositorio `kaiserone01/gym-app` clonado **solo en modo lectura** dentro de un sandbox aislado, únicamente para auditar código real.
- **Ningún archivo del proyecto fue modificado.**
- **Ningún commit ni push fue ejecutado.**
- **Ninguna migración de Prisma fue generada ni ejecutada.**
- Todo lo documentado en este archivo es diseño para revisión — la implementación arranca solo cuando el usuario apruebe explícitamente el Paso 1.
