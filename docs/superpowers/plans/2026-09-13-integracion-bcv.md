# Integración API BCV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el flujo `ActualizarTasaDiaria` del ADR (`IExchangeRateService` → `BcvApiAdapter` → `TasaCambio`), con fallback a la última tasa guardada si la API falla, un script en `apps/worker` para dispararlo (invocado por un cron externo, sin daemon), el caso de uso `ConvertirMontoUSDaVES`, y una ruta de lectura `GET /api/tasa-cambio` en el panel admin.

**Architecture:** Mismo patrón hexagonal. `packages/domain` gana la entidad `TasaCambio`, los puertos `IExchangeRateService`/`ITasaCambioRepository`, y los casos de uso `ActualizarTasaDiaria`/`ObtenerTasaActual`/`ConvertirMontoUSDaVES`. `packages/infrastructure` gana `BcvApiAdapter` (adaptador HTTP a `dolarapi.com`) y `PrismaTasaCambioRepository`. `apps/worker` es una app nueva del monorepo (sin Next.js, un script ejecutado vía `tsx`) que orquesta el caso de uso contra los adaptadores concretos. `apps/web-admin` gana 1 ruta de lectura.

**Tech Stack:** `fetch` nativo de Node 22 (sin dependencia HTTP nueva). `tsx` (ya es devDependency de `web-admin`) para correr TypeScript directo en `apps/worker`.

**Spec:** `docs/adr/ADR-001-gym-app-sesion.md` §4.4/§7 y `ADR-001-gym-app-sesion-v2.md` §13.5, `docs/ROADMAP.md` (funcionalidad 🟡 core). Decisiones de esta sesión:

| Decisión | Resultado |
|---|---|
| Proveedor | `dolarapi.com` (`https://ve.dolarapi.com/v1/dolares/oficial`). Forma real de la respuesta verificada por el usuario: `{"moneda":"USD","fuente":"oficial","nombre":"Dólar","compra":null,"venta":null,"promedio":832.4883,"fechaActualizacion":"2026-09-11T00:00:00-04:00"}`. El campo a usar es `promedio` (BCV oficial no tiene `compra`/`venta` separados, vienen `null`). |
| Frecuencia | 1 vez por día hábil (lunes a viernes) — la tasa oficial del BCV se publica una sola vez al día, no hay webhook real en ninguna API comunitaria. Horario recomendado: después de las 6pm hora Venezuela (BCV publica típicamente entre 3pm y 6pm VET), para asegurar que ya esté publicada. |
| Cómo se dispara | Script simple sin daemon (`apps/worker/src/actualizar-tasa.ts`, corrido con `tsx`). Se agenda con un cron **externo** a este repo (Easypanel scheduled job, GitHub Actions, etc.) — mismo criterio que separó `Dockerfile.migrate` de la lógica de dominio. Este plan no configura el cron externo, solo deja el comando listo para agendar. |
| Fallback si la API falla | `ActualizarTasaDiaria` cae al último valor ya guardado en `TasaCambio` (la tabla YA es el historial/caché) y el script registra una advertencia por consola — sin bloquear nada. No se implementa una clase `ExchangeRateCache` aparte (YAGNI: la tabla cumple ese rol). |
| Qué día usa cada tasa guardada | El campo `fechaActualizacion` que devuelve la API (no "la fecha en que corrió el script") — así, si el BCV no publicó nada nuevo (fin de semana), reintentar el mismo día simplemente sobreescribe la misma fila en vez de crear una fecha incorrecta. |
| Alcance | Pipeline completo (`ActualizarTasaDiaria`) + `ConvertirMontoUSDaVES` (caso de uso de conversión, sin ruta HTTP propia todavía — sin consumidor real como `RegistrarPago` aún) + `GET /api/tasa-cambio` (ruta de lectura de la última tasa, protegida por sesión). |

## Global Constraints

- **`packages/domain` no importa `fetch`/Prisma directamente** — `BcvApiAdapter` (infraestructura) es el único lugar que hace la llamada HTTP real; el dominio solo conoce `IExchangeRateService`.
- **`TasaCambio.fuente` es un `string` libre en Prisma** (no un enum de base de datos, ver `schema.prisma` línea 33: `fuente String // "BCV" | "BINANCE_P2P" | "MANUAL"`) — la entidad de dominio lo tipa como `string`, igual que `Pago.metodo` (mismo patrón ya usado en el Plan 6).
- **Un solo `TasaCambio` por día calendario** (`@@unique` en `fecha`) — `PrismaTasaCambioRepository.guardar` hace `upsert` normalizando la fecha a medianoche UTC antes de escribir, para que reintentos el mismo día no creen filas duplicadas.
- **El fallback nunca inventa una fila nueva** — si la API falla, `ActualizarTasaDiaria` devuelve la última `TasaCambio` ya existente tal cual, sin volver a insertarla ni marcarla con una fuente distinta.
- **`Sucursal.tasaCambioUSD`** (override manual por sucursal, ya existente en el schema) **no se toca en este plan** — queda para cuando exista un consumidor real (ej. `RegistrarPago` mostrando el equivalente en VES). Documentado como decisión de alcance, no un olvido.
- No hay `DELETE` ni edición manual de `TasaCambio` vía HTTP en este plan.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- Modelo `TasaCambio` (`id`, `fecha` único, `valor`, `fuente`, `createdAt`) ya existe en `schema.prisma` desde el Plan 2 — **no hay migración en este plan**.
- `apps/web-admin/lib/sesion.ts` (`obtenerUsuarioDeSesion`) — se reutiliza para proteger `GET /api/tasa-cambio`.
- `apps/web-admin/lib/prisma.ts` — patrón de carga de `.env` desde la raíz del monorepo (`dotenv` + `path.resolve(process.cwd(), "../../.env")`) — se replica en `apps/worker/src/actualizar-tasa.ts` porque es un proceso Node aparte, no Next.js.
- `tsx` ya es devDependency de `apps/web-admin` (usado para `scripts/verificar-autorizacion.ts`) — se agrega también a `apps/worker` para correr el script sin paso de compilación.
- Node 22 (versión instalada) trae `fetch` global — no hace falta ninguna librería HTTP nueva.

---

### Task 1: Entidad `TasaCambio`

**Files:**
- Create: `packages/domain/entities/TasaCambio.ts`

**Interfaces:**
- Produces: `TasaCambio` — consumida por los puertos (Tarea 2), casos de uso (Tarea 3) y la ruta (Tarea 6).

- [ ] **Step 1: `packages/domain/entities/TasaCambio.ts`**

```typescript
export interface TasaCambio {
  id: string;
  fecha: Date;
  valor: number;
  // Columna libre en Prisma (no un enum de base de datos): "BCV" | "BINANCE_P2P" | "MANUAL".
  fuente: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/domain/entities/TasaCambio.ts
git commit -m "feat: agrega la entidad TasaCambio"
```

---

### Task 2: Puertos `IExchangeRateService` e `ITasaCambioRepository`

**Files:**
- Create: `packages/domain/ports/IExchangeRateService.ts`
- Create: `packages/domain/ports/ITasaCambioRepository.ts`

**Interfaces:**
- Consumes: `TasaCambio` (Tarea 1).
- Produces: contratos que la Tarea 4 implementa y la Tarea 3 consume.

- [ ] **Step 1: `packages/domain/ports/IExchangeRateService.ts`**

```typescript
export interface TasaExterna {
  valor: number;
  // Día calendario al que corresponde la tasa, según lo informa la fuente
  // (no necesariamente "hoy" — ej. fin de semana, el BCV no publica).
  fecha: Date;
}

export interface IExchangeRateService {
  obtenerTasaOficial(): Promise<TasaExterna>;
}
```

- [ ] **Step 2: `packages/domain/ports/ITasaCambioRepository.ts`**

```typescript
import { TasaCambio } from "../entities/TasaCambio";

export interface ITasaCambioRepository {
  guardar(fecha: Date, valor: number, fuente: string): Promise<TasaCambio>;
  obtenerUltima(): Promise<TasaCambio | null>;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/ports/IExchangeRateService.ts packages/domain/ports/ITasaCambioRepository.ts
git commit -m "feat: agrega los puertos IExchangeRateService e ITasaCambioRepository"
```

---

### Task 3: Casos de uso `ActualizarTasaDiaria`, `ObtenerTasaActual`, `ConvertirMontoUSDaVES`

**Files:**
- Create: `packages/domain/use-cases/ActualizarTasaDiaria.ts`
- Create: `packages/domain/use-cases/ObtenerTasaActual.ts`
- Create: `packages/domain/use-cases/ConvertirMontoUSDaVES.ts`

**Interfaces:**
- Consumes: `IExchangeRateService`, `ITasaCambioRepository` (Tarea 2).
- Produces: funciones consumidas por el script del worker (Tarea 5) y la ruta (Tarea 6).

- [ ] **Step 1: `packages/domain/use-cases/ActualizarTasaDiaria.ts`**

```typescript
import { IExchangeRateService } from "../ports/IExchangeRateService";
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { TasaCambio } from "../entities/TasaCambio";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("La API del BCV falló y no hay ninguna tasa previa guardada para usar como fallback.");
  }
}

export interface ActualizarTasaDiariaDeps {
  servicioTasa: IExchangeRateService;
  tasas: ITasaCambioRepository;
}

export interface ResultadoActualizarTasaDiaria {
  tasa: TasaCambio;
  fuenteReal: "BCV" | "ULTIMA_GUARDADA";
}

export async function actualizarTasaDiaria(deps: ActualizarTasaDiariaDeps): Promise<ResultadoActualizarTasaDiaria> {
  try {
    const externa = await deps.servicioTasa.obtenerTasaOficial();
    const tasa = await deps.tasas.guardar(externa.fecha, externa.valor, "BCV");
    return { tasa, fuenteReal: "BCV" };
  } catch {
    const ultima = await deps.tasas.obtenerUltima();

    if (!ultima) {
      throw new SinTasaDisponibleError();
    }

    return { tasa: ultima, fuenteReal: "ULTIMA_GUARDADA" };
  }
}
```

- [ ] **Step 2: `packages/domain/use-cases/ObtenerTasaActual.ts`**

```typescript
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { TasaCambio } from "../entities/TasaCambio";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("No hay ninguna tasa de cambio guardada todavía.");
  }
}

export async function obtenerTasaActual(deps: { tasas: ITasaCambioRepository }): Promise<TasaCambio> {
  const ultima = await deps.tasas.obtenerUltima();

  if (!ultima) {
    throw new SinTasaDisponibleError();
  }

  return ultima;
}
```

- [ ] **Step 3: `packages/domain/use-cases/ConvertirMontoUSDaVES.ts`**

```typescript
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";

export class SinTasaDisponibleError extends Error {
  constructor() {
    super("No hay ninguna tasa de cambio guardada todavía.");
  }
}

export interface ResultadoConversion {
  montoVES: number;
  tasaUsada: number;
  fechaTasa: Date;
}

export async function convertirMontoUSDaVES(
  deps: { tasas: ITasaCambioRepository },
  montoUSD: number
): Promise<ResultadoConversion> {
  const ultima = await deps.tasas.obtenerUltima();

  if (!ultima) {
    throw new SinTasaDisponibleError();
  }

  return {
    montoVES: Math.round(montoUSD * ultima.valor * 100) / 100,
    tasaUsada: ultima.valor,
    fechaTasa: ultima.fecha,
  };
}
```

**Nota:** `SinTasaDisponibleError` se declara por separado en `ObtenerTasaActual.ts` y `ConvertirMontoUSDaVES.ts` (mismo criterio ya usado con `MiembroNoEncontradoError` en el Plan 5 — colocado por caso de uso, no centralizado).

- [ ] **Step 4: Commit**

```bash
git add packages/domain/use-cases/ActualizarTasaDiaria.ts packages/domain/use-cases/ObtenerTasaActual.ts packages/domain/use-cases/ConvertirMontoUSDaVES.ts
git commit -m "feat: agrega casos de uso ActualizarTasaDiaria, ObtenerTasaActual, ConvertirMontoUSDaVES"
```

---

### Task 4: Adaptadores `BcvApiAdapter` y `PrismaTasaCambioRepository`

**Files:**
- Create: `packages/infrastructure/exchange-rate/BcvApiAdapter.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts`

**Interfaces:**
- Consumes: `IExchangeRateService`, `ITasaCambioRepository` (Tarea 2).
- Produces: implementaciones que el worker (Tarea 5) y la ruta (Tarea 6) instancian.

- [ ] **Step 1: `packages/infrastructure/exchange-rate/BcvApiAdapter.ts`**

```typescript
import type { IExchangeRateService, TasaExterna } from "@gym-app/domain/ports/IExchangeRateService";

const URL_DOLARAPI_OFICIAL = "https://ve.dolarapi.com/v1/dolares/oficial";

interface RespuestaDolarApi {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

export class BcvApiAdapter implements IExchangeRateService {
  async obtenerTasaOficial(): Promise<TasaExterna> {
    const respuesta = await fetch(URL_DOLARAPI_OFICIAL);

    if (!respuesta.ok) {
      throw new Error(`dolarapi.com respondió ${respuesta.status}`);
    }

    const datos: RespuestaDolarApi = await respuesta.json();

    if (typeof datos.promedio !== "number") {
      throw new Error("dolarapi.com no devolvió un campo 'promedio' numérico.");
    }

    return {
      valor: datos.promedio,
      fecha: new Date(datos.fechaActualizacion),
    };
  }
}
```

- [ ] **Step 2: `packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts`**

```typescript
import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ITasaCambioRepository } from "@gym-app/domain/ports/ITasaCambioRepository";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";

// dolarapi.com devuelve fechaActualizacion normalizada a medianoche hora
// Venezuela (-04:00), que siempre cae en el mismo día calendario en UTC
// (VET nunca cruza medianoche UTC hacia el día siguiente). Se normaliza acá
// de todos modos para que el @@unique de "fecha" en TasaCambio funcione como
// "un registro por día", sin depender de que la fuente siempre mande la hora
// exacta en 00:00:00.
function inicioDelDia(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

type FilaTasaCambio = {
  id: string;
  fecha: Date;
  valor: { toNumber(): number };
  fuente: string;
};

function mapear(fila: FilaTasaCambio): TasaCambio {
  return {
    id: fila.id,
    fecha: fila.fecha,
    valor: fila.valor.toNumber(),
    fuente: fila.fuente,
  };
}

export class PrismaTasaCambioRepository implements ITasaCambioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async guardar(fecha: Date, valor: number, fuente: string): Promise<TasaCambio> {
    const dia = inicioDelDia(fecha);

    const tasa = await this.prisma.tasaCambio.upsert({
      where: { fecha: dia },
      create: { fecha: dia, valor, fuente },
      update: { valor, fuente },
    });

    return mapear(tasa);
  }

  async obtenerUltima(): Promise<TasaCambio | null> {
    const tasa = await this.prisma.tasaCambio.findFirst({
      orderBy: { fecha: "desc" },
    });

    if (!tasa) return null;

    return mapear(tasa);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/infrastructure/exchange-rate/BcvApiAdapter.ts packages/infrastructure/persistence/prisma/PrismaTasaCambioRepository.ts
git commit -m "feat: agrega BcvApiAdapter y PrismaTasaCambioRepository"
```

---

### Task 5: App `apps/worker` con el script `actualizar-tasa`

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/actualizar-tasa.ts`
- Modify: `package.json` (raíz — agrega un script de conveniencia)

**Interfaces:**
- Consumes: `actualizarTasaDiaria` (Tarea 3), `BcvApiAdapter`/`PrismaTasaCambioRepository` (Tarea 4).

- [ ] **Step 1: `apps/worker/package.json`**

```json
{
  "name": "worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "actualizar-tasa": "tsx src/actualizar-tasa.ts"
  },
  "dependencies": {
    "@gym-app/db": "*",
    "@gym-app/domain": "*",
    "@gym-app/infrastructure": "*",
    "@prisma/adapter-pg": "^7.10.0",
    "dotenv": "^17.4.2"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.23.13",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: `apps/worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `apps/worker/src/actualizar-tasa.ts`**

```typescript
import { config } from "dotenv";
import path from "node:path";

// apps/worker no es Next.js — no hay carga automática de .env. El .env real
// vive en la raíz del monorepo (mismo patrón que apps/web-admin/lib/prisma.ts).
config({ path: path.resolve(process.cwd(), "../../.env") });

import { PrismaClient } from "@gym-app/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BcvApiAdapter } from "@gym-app/infrastructure/exchange-rate/BcvApiAdapter";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { actualizarTasaDiaria } from "@gym-app/domain/use-cases/ActualizarTasaDiaria";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const resultado = await actualizarTasaDiaria({
      servicioTasa: new BcvApiAdapter(),
      tasas: new PrismaTasaCambioRepository(prisma),
    });

    if (resultado.fuenteReal === "BCV") {
      console.log(
        `✅ Tasa BCV actualizada: ${resultado.tasa.valor} VES/USD (${resultado.tasa.fecha.toISOString()})`
      );
    } else {
      console.warn(
        `⚠️  La API del BCV falló. Se mantiene la última tasa guardada: ${resultado.tasa.valor} VES/USD (${resultado.tasa.fecha.toISOString()})`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Error al actualizar la tasa del BCV:", error);
  process.exit(1);
});
```

- [ ] **Step 4: Agregar un script de conveniencia en el `package.json` raíz**

Agregar esta línea dentro de `"scripts"` en el `package.json` de la raíz del repo (junto a `"start"`):

```json
    "actualizar-tasa": "npm run actualizar-tasa --workspace apps/worker"
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker package.json
git commit -m "feat: agrega apps/worker con el script actualizar-tasa"
```

---

### Task 6: Ruta `GET /api/tasa-cambio`

**Files:**
- Create: `apps/web-admin/app/api/tasa-cambio/route.ts`

**Interfaces:**
- Consumes: `obtenerTasaActual` (Tarea 3), `PrismaTasaCambioRepository` (Tarea 4), `obtenerUsuarioDeSesion` (Plan 4).

- [ ] **Step 1: `apps/web-admin/app/api/tasa-cambio/route.ts`**

```typescript
// GET /api/tasa-cambio — devuelve la última tasa de cambio guardada
// (la actualiza apps/worker, no esta ruta).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { obtenerTasaActual, SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaActual";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const tasa = await obtenerTasaActual({ tasas: new PrismaTasaCambioRepository(prisma) });

    return NextResponse.json(tasa);
  } catch (error) {
    if (error instanceof SinTasaDisponibleError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al obtener la tasa de cambio:", error);
    return NextResponse.json({ error: "Error interno al obtener la tasa de cambio." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/api/tasa-cambio
git commit -m "feat: agrega la ruta GET /api/tasa-cambio"
```

---

### Task 7: Build + verificación de tipos (sin DB, sin red externa)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Instalar dependencias del workspace nuevo**

Run: `npm install`
Expected: exit 0 — enlaza `apps/worker` como parte del workspace npm (`workspaces: ["apps/*", ...]` en el `package.json` raíz ya lo cubre, esto solo materializa `node_modules`).

- [ ] **Step 2: Verificar tipos de `apps/worker`**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Verificar tipos de `apps/web-admin`**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Build completo**

Run: `cd /home/user/gym-app && npx turbo run build --filter=web-admin`
Expected: exit 0, sin advertencia de dependencia circular. Debería aparecer la ruta `/api/tasa-cambio` en el resumen.

- [ ] **Step 5: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 6: No hay commit en esta tarea** — solo verificación.

---

### Task 8: Probar contra la API y la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración que subir en este plan.

- [ ] **Step 1: Instalar dependencias y correr el script del worker**

```powershell
npm install
npm run actualizar-tasa
```

Expected: consola imprime `✅ Tasa BCV actualizada: <valor> VES/USD (<fecha ISO>)`.

- [ ] **Step 2: Confirmar en la base que se guardó (una sola fila para hoy/último día hábil)**

```powershell
cd packages\db
npx prisma studio
```

Abrir la tabla `TasaCambio` y confirmar que aparece una fila nueva (o actualizada) con `fuente: "BCV"`.

- [ ] **Step 3: Correr el script una segunda vez (debe ser idempotente, no duplicar la fila)**

```powershell
npm run actualizar-tasa
```

Expected: mismo mensaje `✅`. Volver a `Prisma Studio` y confirmar que sigue habiendo **una sola fila** para ese día (se actualizó, no se duplicó).

- [ ] **Step 4: Levantar el servidor y probar la ruta de lectura**

```powershell
cd apps\web-admin
npm run dev
```

En otra terminal, login y consulta:

```powershell
curl.exe -c cookies.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"admin@gymdemo.com\",\"password\":\"admin1234\"}'
curl.exe -b cookies.txt http://localhost:3000/api/tasa-cambio
```

Expected: `200` con `{"id":"...","fecha":"...","valor":832.4883,"fuente":"BCV"}` (el valor real del día).

- [ ] **Step 5: Probar sin sesión (debe rechazar)**

```powershell
curl.exe -i http://localhost:3000/api/tasa-cambio
```

Expected: `401`, `{"error":"No autenticado."}`.

- [ ] **Step 6: (Opcional) Simular que la API falla, para probar el fallback**

Cortar la conexión a internet un momento, o cambiar temporalmente la URL en `BcvApiAdapter.ts` por una inválida, y correr `npm run actualizar-tasa` de nuevo. Expected: consola imprime `⚠️  La API del BCV falló. Se mantiene la última tasa guardada...` con el mismo valor de antes (no crashea, no borra nada). Revertir el cambio temporal si se hizo.

- [ ] **Step 7: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- **Cron externo real** — este plan deja `npm run actualizar-tasa` listo para agendar, pero no configura el scheduled job de Easypanel/GitHub Actions/etc. Sugerencia de horario para cuando se agende: `0 23 * * 1-5` (UTC) = 7:00pm hora Venezuela, lunes a viernes.
- **`Sucursal.tasaCambioUSD` como override manual** — el campo ya existe en el schema pero no se integra en `ConvertirMontoUSDaVES` todavía (sin consumidor real que lo necesite).
- **`RegistrarPago` mostrando el equivalente en VES** — `ConvertirMontoUSDaVES` queda listo pero sin ruta HTTP ni integración en `/api/pagos` en este plan.
- **`BinanceP2PAdapter`** (tasa paralela, se mueve varias veces al día) — mencionado en el ADR como fuente alternativa futura, mismo puerto `IExchangeRateService` lo soportaría, pero no se implementa aquí.
- **`RegistroAuditoria`** del evento de fallback — el script solo imprime una advertencia por consola, no escribe una fila de auditoría.
- **UI del panel admin** para mostrar la tasa (solo se prueba con `curl` en este plan).

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–7 yo mismo en esta sesión (no requieren red externa ni DB), y la Tarea 8 la corres tú.

¿Cuál prefieres?
