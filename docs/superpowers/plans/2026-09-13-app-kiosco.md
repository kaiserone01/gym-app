# App de Kiosco Física (apps/kiosk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `apps/kiosk`, la interfaz real para el check-in físico (hoy solo se prueba con `curl` contra `/api/checkin`), como una PWA estática sin lógica de negocio propia, con cola de pendientes offline real.

**Architecture:** `apps/kiosk` es una app Next.js **sin ningún import de `@gym-app/domain`/`@gym-app/infrastructure`/`@gym-app/db`** — cero lógica de negocio, tal como exige el ADR. Es un cliente HTTP puro que le pega a `POST /api/checkin` (ya existente, Plan 3) desde su propio origen desplegado. `apps/web-admin` gana soporte CORS en esa ruta para aceptar la llamada cross-origin. El kiosco es un PC con **teclado numérico físico** (no pantalla táctil, confirmado en el ADR v1 §2.5) — la UI mantiene un input siempre enfocado que captura ese teclado, no botones en pantalla.

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4 (mismas versiones que `apps/web-admin`), `output: "export"` (build 100% estático, sin servidor propio). IndexedDB nativa del navegador para la cola de pendientes (sin librería nueva). Service worker manual (sin `next-pwa`) para precachear el shell.

**Spec:** `docs/adr/ADR-001-gym-app-sesion.md` §2.5, §4.2, `docs/ROADMAP.md` (funcionalidad 🟡 core). Decisiones de esta sesión:

| Decisión | Resultado |
|---|---|
| Stack | Next.js (consistencia con `web-admin`), pero `output: "export"` — sin rutas API propias, sin SSR por request. |
| Config del `apiKey` de Sucursal | Pantalla `/config` + `localStorage` del dispositivo — un solo build sirve para cualquier sucursal/organización, el staff pega el key una vez al configurar el kiosco físico. |
| URL del backend (`apps/web-admin`) | Fija en build time (`NEXT_PUBLIC_API_URL`) — una sola instancia de `apps/web-admin` sirve a todas las organizaciones (es multi-tenant), no hace falta configurarla por kiosco. |
| Alcance del PWA | Service worker con **soporte offline real**: cola de pendientes en IndexedDB que reintenta automáticamente cuando vuelve la red (evento `online`), no solo un manifest decorativo. |
| Hardware real del kiosco | PC con teclado numérico físico (ADR v1 §2.5) — la UI es un input siempre enfocado, no un teclado numérico dibujado en pantalla. |

## Global Constraints

- **`apps/kiosk` no importa `@gym-app/domain`, `@gym-app/infrastructure` ni `@gym-app/db`** — ninguna dependencia de esos paquetes en su `package.json`. Toda su lógica es orquestación de UI + llamadas HTTP a una API ya construida y probada.
- **La cola offline solo encola fallas de red real** (`fetch` no obtiene ninguna respuesta — se detecta como `TypeError` del `fetch` nativo). Un error que el servidor sí respondió (cédula inexistente, apiKey inválido) **nunca se encola** — reintentarlo no cambiaría el resultado.
- **Un check-in encolado se timestampea con la hora del servidor en el momento en que finalmente se reintenta con éxito**, no con la hora en que ocurrió físicamente — limitación conocida y documentada, no hay forma de evitarla sin que el servidor confíe en un timestamp del cliente (violaría el mismo principio de seguridad que llevó a nunca confiar en `sucursalId` del body).
- **CORS en `/api/checkin` es intencionalmente permisivo (`*`)** porque la autenticación real es el `apiKey` (un header que el navegador nunca adjunta automáticamente, a diferencia de una cookie) — ningún origen puede hacer nada sin conocerlo.
- El service worker **nunca intercepta el `POST` a `/api/checkin`** — solo precachea el shell estático (HTML/JS/CSS/manifest/íconos) para que la PWA abra aunque la red esté caída al momento de abrir la pantalla.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `POST /api/checkin` (`apps/web-admin/app/api/checkin/route.ts`, Plan 3) — ya implementa toda la lógica real (autenticación por `apiKey` de Sucursal, `RegistrarCheckIn`, idempotencia de 2 minutos). Este plan solo le agrega CORS, no toca su lógica de negocio.
- `RegistrarCheckIn` (`packages/domain/use-cases/RegistrarCheckIn.ts`) ya es idempotente por `miembroId`+`sucursalId` en una ventana de 2 minutos — un reintento automático de un check-in encolado que en realidad ya se había procesado (ej. la respuesta se perdió en la red pero el servidor sí lo guardó) no duplica nada.
- Contrato de la respuesta ya estable y probado: éxito `200 {"nombre","fotoUrl","entrenador","planTipo","estado":"activo"|"vencido"}`; error `404 {"error":"No se encontró ningún miembro con esa cédula."}`; `401`/`400`/`500` con `{"error": "..."}`.
- Mismas versiones de Next.js (16.3.4)/React (19.2.8)/Tailwind (v4) que `apps/web-admin` — se replican para consistencia, no para compartir código entre ambas apps (no lo necesitan).

---

### Task 1: Scaffold de `apps/kiosk`

**Files:**
- Create: `apps/kiosk/package.json`
- Create: `apps/kiosk/next.config.ts`
- Create: `apps/kiosk/tsconfig.json`
- Create: `apps/kiosk/postcss.config.mjs`
- Create: `apps/kiosk/eslint.config.mjs`
- Create: `apps/kiosk/app/globals.css`

**Interfaces:** ninguna todavía — scaffolding puro.

- [ ] **Step 1: `apps/kiosk/package.json`**

```json
{
  "name": "kiosk",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "16.3.4",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.4",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

**Nota:** sin `@gym-app/db`, `@gym-app/domain` ni `@gym-app/infrastructure` — a propósito (ver Global Constraints).

- [ ] **Step 2: `apps/kiosk/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/kiosk no tiene backend propio (ADR: "cero lógica de negocio") —
  // todo se sirve como HTML/JS/CSS estático y habla por HTTP con
  // apps/web-admin (ver lib/api.ts).
  output: "export",
};

export default nextConfig;
```

- [ ] **Step 3: `apps/kiosk/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: `apps/kiosk/postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 5: `apps/kiosk/eslint.config.mjs`**

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

- [ ] **Step 6: `apps/kiosk/app/globals.css`**

```css
@import "tailwindcss";

body {
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/package.json apps/kiosk/next.config.ts apps/kiosk/tsconfig.json apps/kiosk/postcss.config.mjs apps/kiosk/eslint.config.mjs apps/kiosk/app/globals.css
git commit -m "feat: scaffold de apps/kiosk (Next.js, output export, sin deps de @gym-app/*)"
```

---

### Task 2: CORS en `POST /api/checkin`

**Files:**
- Modify: `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Produces: mismo contrato de respuesta de siempre, ahora con headers CORS — consumido por `apps/kiosk/lib/api.ts` (Tarea 3).

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

```typescript
// app/api/checkin/route.ts
// Endpoint de check-in: el kiosco se autentica con su apiKey de Sucursal
// (header X-Kiosk-Api-Key, ADR-001 v1 §4.2 — el sucursalId ya NO viaja en
// el body). Este handler solo valida entrada/salida HTTP; toda la lógica
// de negocio vive en el caso de uso RegistrarCheckIn (packages/domain).
//
// CORS: apps/kiosk se sirve desde su propio origen, distinto al de
// apps/web-admin — el navegador del kiosco hace un POST cross-origin con
// un header custom (X-Kiosk-Api-Key), lo que dispara un preflight OPTIONS.
// Es seguro permitir cualquier origen acá porque la autenticación real es
// el apiKey (un header que el navegador nunca adjunta automáticamente, a
// diferencia de una cookie) — sin conocerlo, ningún origen puede hacer nada.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KioskTokenValidator } from "@gym-app/infrastructure/auth/KioskTokenValidator";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { registrarCheckIn, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/RegistrarCheckIn";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Kiosk-Api-Key",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-kiosk-api-key");

    if (!apiKey) {
      return json({ error: "Falta el header X-Kiosk-Api-Key." }, 401);
    }

    const kioskAuth = new KioskTokenValidator(prisma);
    const sucursal = await kioskAuth.validar(apiKey);

    if (!sucursal) {
      return json({ error: "API key de sucursal inválida." }, 401);
    }

    const { cedula } = await req.json();

    if (!cedula) {
      return json({ error: "Cédula es requerida." }, 400);
    }

    const resultado = await registrarCheckIn(
      {
        miembros: new PrismaMemberRepository(prisma),
        checkIns: new PrismaCheckInRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
      },
      { organizacionId: sucursal.organizacionId, sucursalId: sucursal.id, cedula }
    );

    return json(
      {
        nombre: resultado.nombre,
        fotoUrl: resultado.fotoUrl,
        entrenador: resultado.entrenadorNombre,
        planTipo: resultado.planTipo,
        estado: resultado.estado,
      },
      200
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return json({ error: error.message }, 404);
    }
    console.error("Error en check-in:", error);
    return json({ error: "Error interno al procesar el check-in." }, 500);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/api/checkin/route.ts
git commit -m "feat: agrega soporte CORS a POST /api/checkin para apps/kiosk"
```

---

### Task 3: Cliente API y configuración del `apiKey`

**Files:**
- Create: `apps/kiosk/lib/api.ts`
- Create: `apps/kiosk/lib/config.ts`

**Interfaces:**
- Produces: `registrarCheckIn`, `ErrorCheckIn`, `ResultadoCheckIn` (consumidos por la Tarea 6); `obtenerApiKey`/`guardarApiKey` (consumidos por las Tareas 5 y 6).

- [ ] **Step 1: `apps/kiosk/lib/config.ts`**

```typescript
const CLAVE_STORAGE = "kiosco_api_key";

export function obtenerApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CLAVE_STORAGE);
}

export function guardarApiKey(apiKey: string): void {
  window.localStorage.setItem(CLAVE_STORAGE, apiKey);
}
```

- [ ] **Step 2: `apps/kiosk/lib/api.ts`**

```typescript
const URL_API = process.env.NEXT_PUBLIC_API_URL;

export type EstadoCheckIn = "activo" | "vencido";

export interface ResultadoCheckIn {
  nombre: string;
  fotoUrl: string | null;
  entrenador: string | null;
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  estado: EstadoCheckIn;
}

// Se lanza cuando el servidor SÍ respondió, pero con un error (401/400/404/500).
// Reintentar esto no cambia nada — nunca se encola en la cola offline.
export class ErrorCheckIn extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Si la red falla del todo, fetch nativo lanza un TypeError (no llega a
// haber respuesta) — eso es lo que distingue "sin conexión, reintentar
// después" (no se lanza ErrorCheckIn) de "el servidor respondió que no"
// (se lanza ErrorCheckIn, no es reintentable).
export async function registrarCheckIn(apiKey: string, cedula: string): Promise<ResultadoCheckIn> {
  if (!URL_API) {
    throw new Error("NEXT_PUBLIC_API_URL no está configurada en este build.");
  }

  const respuesta = await fetch(`${URL_API}/api/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Api-Key": apiKey,
    },
    body: JSON.stringify({ cedula }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new ErrorCheckIn(datos.error ?? "Error al registrar el check-in.", respuesta.status);
  }

  return datos as ResultadoCheckIn;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/kiosk/lib/api.ts apps/kiosk/lib/config.ts
git commit -m "feat: agrega el cliente API y la configuración de apiKey del kiosco"
```

---

### Task 4: Cola de pendientes offline (IndexedDB)

**Files:**
- Create: `apps/kiosk/lib/colaPendientes.ts`
- Create: `apps/kiosk/lib/reintentarPendientes.ts`

**Interfaces:**
- Consumes: `registrarCheckIn`, `ErrorCheckIn` (Tarea 3).
- Produces: `encolar`, `listarPendientes`, `quitarPendiente`, `reintentarPendientes` — consumidos por la página principal (Tarea 6).

- [ ] **Step 1: `apps/kiosk/lib/colaPendientes.ts`**

```typescript
const NOMBRE_DB = "kiosco-checkin";
const VERSION_DB = 1;
const ALMACEN = "pendientes";

export interface CheckInPendiente {
  id: number;
  cedula: string;
  // Solo para mostrarle al staff cuándo se encoló — NO es la fechaHora real
  // del check-in, esa la pone el servidor cuando finalmente se procesa.
  encoladoEn: string;
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);

    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: "id", autoIncrement: true });
      }
    };

    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function encolar(cedula: string): Promise<void> {
  const db = await abrirDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).add({ cedula, encoladoEn: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listarPendientes(): Promise<CheckInPendiente[]> {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readonly");
    const solicitud = tx.objectStore(ALMACEN).getAll();
    solicitud.onsuccess = () => resolve(solicitud.result as CheckInPendiente[]);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function quitarPendiente(id: number): Promise<void> {
  const db = await abrirDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: `apps/kiosk/lib/reintentarPendientes.ts`**

```typescript
import { registrarCheckIn, ErrorCheckIn } from "./api";
import { listarPendientes, quitarPendiente } from "./colaPendientes";

// Reintenta cada pendiente en orden de encolado. Si uno falla de nuevo por
// red, se corta ahí mismo — la red probablemente sigue caída, no tiene
// sentido seguir intentando los siguientes en esta pasada (se reintentará
// en el próximo evento "online"). Si el servidor SÍ responde (aunque sea
// con un error, ej. cédula que ya no existe), se descarta igual: ya
// obtuvo una respuesta real, reintentar no la va a cambiar.
export async function reintentarPendientes(apiKey: string): Promise<void> {
  const pendientes = await listarPendientes();

  for (const pendiente of pendientes) {
    try {
      await registrarCheckIn(apiKey, pendiente.cedula);
      await quitarPendiente(pendiente.id);
    } catch (error) {
      if (error instanceof ErrorCheckIn) {
        await quitarPendiente(pendiente.id);
        continue;
      }
      return;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/kiosk/lib/colaPendientes.ts apps/kiosk/lib/reintentarPendientes.ts
git commit -m "feat: agrega la cola de pendientes offline (IndexedDB) y su reintento automático"
```

---

### Task 5: Página de configuración `/config`

**Files:**
- Create: `apps/kiosk/app/config/page.tsx`

**Interfaces:**
- Consumes: `obtenerApiKey`, `guardarApiKey` (Tarea 3).

- [ ] **Step 1: `apps/kiosk/app/config/page.tsx`**

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { guardarApiKey, obtenerApiKey } from "@/lib/config";

export default function PaginaConfiguracion() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");

  // No se lee localStorage en el useState inicial: durante el export
  // estático, esta página se prerenderiza en Node (sin window) y React
  // hidrata con ese mismo valor inicial — hay que leer el valor real
  // después del montaje, en un efecto.
  useEffect(() => {
    const guardado = obtenerApiKey();
    if (guardado) setApiKey(guardado);
  }, []);

  function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!apiKey.trim()) return;
    guardarApiKey(apiKey.trim());
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white p-8">
      <h1 className="text-2xl font-semibold">Configuración del kiosco</h1>
      <p className="max-w-md text-center text-neutral-400">
        Pegá el API key de esta sucursal (lo genera el panel admin al crearla). Se guarda en este
        dispositivo — no hace falta repetirlo salvo que se rote el key.
      </p>
      <form onSubmit={guardar} className="flex flex-col gap-4 w-full max-w-md">
        <input
          value={apiKey}
          onChange={(evento) => setApiKey(evento.target.value)}
          placeholder="API key de la sucursal"
          className="bg-neutral-900 border border-neutral-700 rounded px-4 py-3 text-lg outline-none"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-3 text-lg font-semibold"
        >
          Guardar y continuar
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/kiosk/app/config/page.tsx
git commit -m "feat: agrega la pantalla de configuración del apiKey del kiosco"
```

---

### Task 6: Página principal de check-in (`/`)

**Files:**
- Create: `apps/kiosk/app/page.tsx`

**Interfaces:**
- Consumes: `obtenerApiKey` (Tarea 3), `registrarCheckIn`/`ErrorCheckIn` (Tarea 3), `encolar`/`listarPendientes` (Tarea 4), `reintentarPendientes` (Tarea 4).

- [ ] **Step 1: `apps/kiosk/app/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerApiKey } from "@/lib/config";
import { registrarCheckIn, ErrorCheckIn, type ResultadoCheckIn } from "@/lib/api";
import { encolar, listarPendientes } from "@/lib/colaPendientes";
import { reintentarPendientes } from "@/lib/reintentarPendientes";

type Estado =
  | { tipo: "esperando" }
  | { tipo: "procesando" }
  | { tipo: "resultado"; resultado: ResultadoCheckIn }
  | { tipo: "pendiente" }
  | { tipo: "error"; mensaje: string };

export default function PaginaCheckIn() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "esperando" });
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const clave = obtenerApiKey();
    if (!clave) {
      router.replace("/config");
      return;
    }
    setApiKey(clave);
  }, [router]);

  const actualizarPendientes = useCallback(() => {
    listarPendientes().then((lista) => setPendientes(lista.length));
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    actualizarPendientes();
    reintentarPendientes(apiKey).then(actualizarPendientes);

    const alReconectar = () => {
      reintentarPendientes(apiKey).then(actualizarPendientes);
    };
    window.addEventListener("online", alReconectar);
    return () => window.removeEventListener("online", alReconectar);
  }, [apiKey, actualizarPendientes]);

  // El kiosco tiene un teclado numérico físico, no pantalla táctil (ADR
  // v1 §2.5) — el input siempre debe estar enfocado para capturarlo sin
  // que el staff tenga que tocar nada.
  useEffect(() => {
    inputRef.current?.focus();
  });

  async function enviar() {
    if (!apiKey || !cedula || estado.tipo === "procesando") return;

    setEstado({ tipo: "procesando" });

    try {
      const resultado = await registrarCheckIn(apiKey, cedula);
      setEstado({ tipo: "resultado", resultado });
    } catch (error) {
      if (error instanceof ErrorCheckIn) {
        setEstado({ tipo: "error", mensaje: error.message });
      } else {
        await encolar(cedula);
        actualizarPendientes();
        setEstado({ tipo: "pendiente" });
      }
    }

    setCedula("");
    setTimeout(() => setEstado({ tipo: "esperando" }), 4000);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-black text-white p-8">
      {pendientes > 0 && (
        <div className="fixed top-4 right-4 rounded bg-amber-600 px-3 py-1 text-sm">
          {pendientes} pendiente{pendientes === 1 ? "" : "s"} por sincronizar
        </div>
      )}

      <h1 className="text-3xl font-semibold">Ingresa tu cédula</h1>

      <input
        ref={inputRef}
        value={cedula}
        onChange={(evento) => setCedula(evento.target.value.replace(/\D/g, ""))}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") enviar();
          if (evento.key === "Escape") setCedula("");
        }}
        onBlur={() => inputRef.current?.focus()}
        inputMode="numeric"
        autoFocus
        className="w-full max-w-xl text-center text-6xl tracking-widest bg-transparent border-b-4 border-white py-4 outline-none"
      />

      <div className="min-h-40 flex items-center justify-center text-center">
        {estado.tipo === "procesando" && <p className="text-2xl">Verificando…</p>}

        {estado.tipo === "resultado" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-4xl font-bold">{estado.resultado.nombre}</p>
            <p
              className={
                estado.resultado.estado === "activo" ? "text-2xl text-green-400" : "text-2xl text-red-400"
              }
            >
              {estado.resultado.estado === "activo" ? "✅ Acceso permitido" : "⚠️ Membresía vencida"}
            </p>
          </div>
        )}

        {estado.tipo === "pendiente" && (
          <p className="text-2xl text-amber-400">
            Sin conexión — el check-in se guardó y se enviará solo cuando vuelva la red.
          </p>
        )}

        {estado.tipo === "error" && <p className="text-2xl text-red-400">{estado.mensaje}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/kiosk/app/page.tsx
git commit -m "feat: agrega la pantalla principal de check-in del kiosco"
```

---

### Task 7: PWA (manifest, íconos, service worker)

**Files:**
- Create: `apps/kiosk/public/manifest.json`
- Create: `apps/kiosk/public/icon-192.png`
- Create: `apps/kiosk/public/icon-512.png`
- Create: `apps/kiosk/public/sw.js`
- Create: `apps/kiosk/app/RegistrarServiceWorker.tsx`
- Create: `apps/kiosk/app/layout.tsx`

**Interfaces:** ninguna — capa de presentación/PWA, sin lógica de dominio.

- [ ] **Step 1: `apps/kiosk/public/manifest.json`**

```json
{
  "name": "Check-in Gym",
  "short_name": "Check-in",
  "start_url": "/",
  "display": "fullscreen",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generar los íconos placeholder**

No hay diseño de marca todavía (`packages/design-system`/`theming` siguen vacíos, ver ROADMAP) — se generan cuadrados sólidos como placeholder, a reemplazar cuando exista un ícono real.

```bash
python3 -c "
import struct, zlib

def write_png(path, size, color=(37, 99, 235)):
    raw = b''
    for _ in range(size):
        raw += b'\x00' + bytes(color) * size

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))

write_png('apps/kiosk/public/icon-192.png', 192)
write_png('apps/kiosk/public/icon-512.png', 512)
"
```

- [ ] **Step 3: `apps/kiosk/public/sw.js`**

```javascript
// Precachea el shell de la app para que la PWA (instalada como "Agregar a
// pantalla de inicio" en el kiosco) abra aunque la red esté caída en ese
// momento. El check-in en sí SIEMPRE requiere red real (o queda en la cola
// de pendientes, ver lib/colaPendientes.ts) — este service worker nunca
// intercepta el POST a /api/checkin.
const CACHE = "kiosco-shell-v1";
const RECURSOS_SHELL = ["/", "/config", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(RECURSOS_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;

  evento.respondWith(
    caches.match(evento.request).then((respuestaCacheada) => {
      return respuestaCacheada || fetch(evento.request).catch(() => caches.match("/"));
    })
  );
});
```

- [ ] **Step 4: `apps/kiosk/app/RegistrarServiceWorker.tsx`**

```tsx
"use client";

import { useEffect } from "react";

export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("No se pudo registrar el service worker:", error);
      });
    }
  }, []);

  return null;
}
```

- [ ] **Step 5: `apps/kiosk/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistrarServiceWorker } from "./RegistrarServiceWorker";

export const metadata: Metadata = {
  title: "Check-in",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/public apps/kiosk/app/RegistrarServiceWorker.tsx apps/kiosk/app/layout.tsx
git commit -m "feat: agrega manifest, íconos y service worker (PWA) al kiosco"
```

---

### Task 8: `Dockerfile` de `apps/kiosk`

**Files:**
- Create: `apps/kiosk/Dockerfile`

**Interfaces:** ninguna — solo empaquetado para deploy.

- [ ] **Step 1: `apps/kiosk/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Dockerfile para apps/kiosk — build 100% estático (output: "export", ver
# next.config.ts), sin backend propio (ADR: "cero lógica de negocio").
# Contexto de build requerido: la RAÍZ del repo (mismo motivo que el
# Dockerfile de apps/web-admin: necesita el package-lock.json raíz para
# resolver los workspaces con `npm ci`).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/kiosk/package.json apps/kiosk/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
COPY packages/design-system/package.json packages/design-system/package.json
COPY packages/theming/package.json packages/theming/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY apps/kiosk apps/kiosk

# Fija en build time (decisión de esta sesión) — un build por entorno
# (staging/producción), no por Organización: todas comparten la misma
# instancia de apps/web-admin (es multi-tenant).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npx turbo run build --filter=kiosk

# ---- runner: sirve el export estático con un servidor mínimo -------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /repo/apps/kiosk/out ./out

EXPOSE 3000
CMD ["serve", "-s", "out", "-l", "3000"]
```

**Nota:** este Dockerfile no se puede probar dentro de esta sandbox (sin daemon de Docker corriendo) — queda para que el usuario lo valide, igual que el `Dockerfile` original de `apps/web-admin` se validó contra el build log real de Easypanel, no localmente.

- [ ] **Step 2: Commit**

```bash
git add apps/kiosk/Dockerfile
git commit -m "feat: agrega el Dockerfile de apps/kiosk (build estático + serve)"
```

---

### Task 9: Build + verificación de tipos (sin DB, sin red externa)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Instalar dependencias del workspace nuevo**

Run: `npm install`
Expected: exit 0.

- [ ] **Step 2: Verificar tipos de `apps/kiosk`**

Run: `cd apps/kiosk && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Verificar tipos de `apps/web-admin` (por el cambio de CORS)**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Build estático completo de `apps/kiosk`**

Run: `cd /home/user/gym-app && npx turbo run build --filter=kiosk`
Expected: exit 0. Debe generar `apps/kiosk/out/` con `index.html`, `config/index.html`, y los assets estáticos.

- [ ] **Step 5: Build de `apps/web-admin` (por el cambio de CORS)**

Run: `npx turbo run build --filter=web-admin`
Expected: exit 0, `/api/checkin` sigue apareciendo en el resumen.

- [ ] **Step 6: Lint de ambas apps**

Run: `npx turbo run lint --filter=kiosk --filter=web-admin`
Expected: exit 0.

- [ ] **Step 7: No hay commit en esta tarea** — solo verificación.

---

### Task 10: Verificación en vivo del CORS (sin DB — solo el preflight)

**Files:** ninguno — tarea de verificación.

El handler `OPTIONS` de `/api/checkin` (Tarea 2) no toca Prisma en absoluto — se puede probar contra un `apps/web-admin` corriendo en esta sandbox sin necesitar la base real, siempre que no se llegue a disparar el `POST` (ese sí necesitaría la DB).

- [ ] **Step 1: Levantar `apps/web-admin` en background**

Run: `cd apps/web-admin && npm run dev &` (puerto 3000)

- [ ] **Step 2: Probar el preflight CORS simulando el origen del kiosco**

```bash
curl -i -X OPTIONS http://localhost:3000/api/checkin \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-kiosk-api-key"
```

Expected: `204`, con `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS` y `Access-Control-Allow-Headers: Content-Type, X-Kiosk-Api-Key` en la respuesta. Sin ningún intento de conexión a la base de datos (el handler `OPTIONS` no la toca).

- [ ] **Step 3: Apagar el servidor de prueba**

Run: matar el proceso de `npm run dev` levantado en el Step 1.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación.

---

### Task 11: Probar el flujo completo contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración en este plan.

- [ ] **Step 1: Configurar la URL del backend y levantar ambas apps**

```powershell
# En apps/kiosk/.env.local (crear si no existe):
# NEXT_PUBLIC_API_URL=http://localhost:3000

cd apps\web-admin
npm run dev
```

En otra terminal:

```powershell
cd apps\kiosk
npm run dev
```

- [ ] **Step 2: Conseguir el `apiKey` real de una Sucursal del seed**

```powershell
cd packages\db
npx prisma studio
```

Abrir la tabla `Sucursal` y copiar el valor de `apiKey`.

- [ ] **Step 3: Abrir el kiosco en el navegador y configurarlo**

Abrir `http://localhost:3001` — debería redirigir a `/config` (todavía no hay `apiKey` guardado). Pegar el `apiKey` copiado y guardar. Debería volver a `/` y mostrar el input enfocado.

- [ ] **Step 4: Probar un check-in real con una cédula del seed**

Escribir `19141319` (Rayza Aray, miembro activo del seed) y presionar Enter.

Expected: aparece "Rayza Aray" y "✅ Acceso permitido".

- [ ] **Step 5: Probar con una cédula inexistente**

Escribir `00000000` y Enter.

Expected: mensaje de error "No se encontró ningún miembro con esa cédula." (no se encola, es un error real del servidor).

- [ ] **Step 6: Simular pérdida de red y confirmar que encola**

En las DevTools del navegador (pestaña Network), activar "Offline". Escribir `19141319` de nuevo y Enter.

Expected: mensaje "Sin conexión — el check-in se guardó..." y aparece el badge "1 pendiente por sincronizar" en la esquina.

- [ ] **Step 7: Confirmar que reintenta solo al volver la red**

Desactivar "Offline" en DevTools (o disparar manualmente el evento `online` recargando la conectividad). En unos segundos el badge de pendientes debería desaparecer.

- [ ] **Step 8: Confirmar en Prisma Studio que el `CheckIn` quedó registrado**

Volver a `npx prisma studio`, tabla `CheckIn` — debería aparecer una fila nueva para el miembro de Rayza Aray, con `fechaHora` la hora en que se reintentó (no la hora original en que se escribió sin red — limitación documentada en el plan).

- [ ] **Step 9: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Foto del miembro (`fotoUrl`) en el resultado del check-in — el contrato ya la trae, pero esta versión solo muestra nombre + estado, para mantener la UI simple.
- Theming por Organización en el kiosco (`packages/theming` sigue vacío) — hoy es una UI genérica en negro/blanco.
- Pantalla de administración del propio kiosco (rotar el `apiKey` guardado, ver historial de pendientes fallidos permanentemente, etc.) — solo hay un `/config` de una sola pantalla.
- Acceso a hardware físico (RFID, molinetes) — el ADR ya anticipa que si hace falta, se envuelve esta misma lógica en Tauri más adelante, sin reescritura (por eso `apps/kiosk` no tiene ninguna lógica de negocio propia que reescribir).
- Tests automatizados (Playwright/Jest) — ningún plan anterior de este proyecto los tiene; se verifica manualmente, igual que el resto.

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–10 yo mismo en esta sesión (no requieren la base de datos real), y la Tarea 11 la corres tú.

¿Cuál prefieres?
