# Tema "Adrenalina Xtreme" — Login y Ficha de Acceso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el tema real de marca (verde muestreado del logo, tipografía Bebas Neue/Barlow) a la pantalla `/login` de `apps/web-admin` (Opción B del mockup: logo circular + halo suave) y a la ficha de resultado del check-in de `apps/kiosk` (banner de estado + avatar + datos), arrancando `packages/theming` con la metodología de sistema de diseño (tokens → componentes → páginas).

**Architecture:** `packages/theming` exporta tokens como módulo TypeScript (mismo patrón de consumo que `@gym-app/domain`/`@gym-app/ui` — transpilado, no un paquete CSS resuelto vía `@import` entre workspaces) y un componente `<ThemeStyleTag>` que los inyecta como variables CSS en `:root`. `packages/ui` gana `LogoBadge`. `apps/kiosk` gana `AccessCard` (específico de esa app, no compartido todavía). `apps/web-admin` monta el tema **solo dentro de `/login`**, nunca en el layout raíz, para no afectar el panel `/miembros` ya construido.

**Tech Stack:** Sin dependencias nuevas. Google Fonts (Bebas Neue, Barlow, Barlow Condensed) vía `<link>` — ya está en el CSP-allowlist del proyecto (mismas fuentes usadas en el mockup aprobado).

**Spec:** `docs/design/tema-adrenalina-xtreme.md` (tokens de color/tipografía, metodología de muestreo del verde real, inventario de componentes, alcance). Decisiones de esta sesión, resumidas:

| Decisión | Resultado |
|---|---|
| Alcance del theming | Tema fijo (hardcodeado) en `packages/theming`, no resolución dinámica por `TemaOrganizacion` — eso es un plan aparte que sí tocaría dominio/infraestructura. |
| Datos de la ficha de acceso | Solo lo que `/api/checkin` ya devuelve (nombre, foto, entrenador, estado) + la hora calculada en el cliente al recibir la respuesta. Sin "miembro desde"/"vence" — requeriría extender el endpoint, fuera de este plan. |
| Logo | Se usa el archivo ya subido `apps/web-admin/public/branding/logo-adrenalina-gym.jpg`, sin flujo de upload (no existe ninguno en el proyecto todavía). |

## Global Constraints

- **El panel `/miembros` no se toca.** `ThemeStyleTag` se monta únicamente dentro de la página `/login`, nunca en `apps/web-admin/app/layout.tsx` — `:root` es global mientras el componente está montado, y Next.js desmonta el árbol de `/login` al navegar a `/miembros`, así que los tokens no se filtran.
- **`apps/kiosk` sigue sin importar `@gym-app/domain`/`infrastructure`/`db`** — `@gym-app/theming` y `@gym-app/ui` son paquetes de presentación pura (sin Prisma, sin casos de uso), agregarlos no viola la regla del ADR ("cero lógica de negocio").
- **`AccessCard` vive en `apps/kiosk/components/`, no en `packages/ui`** — un solo consumidor hoy; se promueve a `packages/ui` si aparece un segundo caso real (mismo criterio ya usado con `domain-custom`).
- **Los valores de los tokens son los del spec, no los del mockup** — el mockup usaba `#A6FF00` (inventado); el token real (`--gx-accent: #93e83a`) sale de muestrear el logo real (ver spec).
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `apps/web-admin/public/branding/logo-adrenalina-gym.jpg` — ya está en el repo, se referencia tal cual.
- `POST /api/checkin` (`apps/web-admin/app/api/checkin/route.ts`, Plan 3) — contrato de respuesta sin cambios: `{nombre, fotoUrl, entrenador, planTipo, estado}`.
- `apps/kiosk/lib/api.ts` (`ResultadoCheckIn`, `registrarCheckIn`, `ErrorCheckIn`) — Plan 8, sin cambios.
- `apps/kiosk/app/page.tsx` (Plan 8) — hoy renderiza el resultado como texto plano; este plan reemplaza solo ese bloque, la lógica de cola offline/reintento/teclado no se toca.
- `apps/web-admin/app/login/page.tsx` (Plan 4/9) — la lógica de `fetch("/api/auth/login")` y el manejo de error no se toca, solo el JSX/estilos.
- `packages/ui/package.json` ya tiene `peerDependencies` a `next`/`react` (Plan 9) — mismo patrón para `packages/theming`.
- `apps/web-admin` ya tiene `@gym-app/ui` en `transpilePackages` y el `@source` de Tailwind (Plan 9) — este plan solo le agrega `@gym-app/theming`.

---

### Task 1: Tokens y `ThemeStyleTag` en `packages/theming`

**Files:**
- Modify: `packages/theming/package.json`
- Create: `packages/theming/tokens.ts`
- Create: `packages/theming/ThemeStyleTag.tsx`

**Interfaces:**
- Produces: `Tema`, `temaAdrenalinaXtreme`, `ThemeStyleTag` — consumidos por las Tareas 4 y 6.

- [ ] **Step 1: Reemplazar `packages/theming/package.json`**

```json
{
  "name": "@gym-app/theming",
  "version": "0.0.0",
  "private": true,
  "peerDependencies": {
    "react": "*"
  }
}
```

- [ ] **Step 2: `packages/theming/tokens.ts`**

```typescript
export interface Tema {
  ground: string;
  surface: string;
  surface2: string;
  edge: string;
  ink: string;
  muted: string;
  mutedDim: string;
  accent: string;
  accentInk: string;
  bad: string;
  badInk: string;
}

// Verde muestreado del logo real de Adrenalina Xtreme Gym — ver
// docs/design/tema-adrenalina-xtreme.md para la metodología de muestreo.
// Tema fijo por ahora: la resolución dinámica por Organización
// (TemaOrganizacion) queda para un plan aparte.
export const temaAdrenalinaXtreme: Tema = {
  ground: "#0a0d07",
  surface: "#12160d",
  surface2: "#191f11",
  edge: "#26301a",
  ink: "#f3f6ec",
  muted: "#93a17d",
  mutedDim: "#545e42",
  accent: "#93e83a",
  accentInk: "#0c1400",
  bad: "#ff3b4e",
  badInk: "#200609",
};
```

- [ ] **Step 3: `packages/theming/ThemeStyleTag.tsx`**

```tsx
import type { Tema } from "./tokens";

const VARIABLE_CSS: Record<keyof Tema, string> = {
  ground: "--gx-ground",
  surface: "--gx-surface",
  surface2: "--gx-surface-2",
  edge: "--gx-edge",
  ink: "--gx-ink",
  muted: "--gx-muted",
  mutedDim: "--gx-muted-dim",
  accent: "--gx-accent",
  accentInk: "--gx-accent-ink",
  bad: "--gx-bad",
  badInk: "--gx-bad-ink",
};

// Inyecta el tema como variables CSS en :root. :root es global mientras
// este componente esté montado — en apps/web-admin se monta SOLO en
// /login (ver docs/design/tema-adrenalina-xtreme.md), nunca en el layout
// raíz, para no filtrar estos colores al panel /miembros.
export function ThemeStyleTag({ tema }: { tema: Tema }) {
  const declaraciones = (Object.keys(tema) as (keyof Tema)[])
    .map((clave) => `  ${VARIABLE_CSS[clave]}: ${tema[clave]};`)
    .join("\n");

  return <style>{`:root {\n${declaraciones}\n}`}</style>;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/theming
git commit -m "feat: agrega los tokens del tema Adrenalina Xtreme y ThemeStyleTag"
```

---

### Task 2: Componente `LogoBadge` en `packages/ui`

**Files:**
- Create: `packages/ui/components/LogoBadge.tsx`

**Interfaces:**
- Produces: `LogoBadge` — consumido por la Tarea 4.

- [ ] **Step 1: `packages/ui/components/LogoBadge.tsx`**

```tsx
// Opción B del mockup aprobado: recorte circular del logo + halo suave
// detrás, sin animación (la versión con radar giratorio se descartó por
// exceso de verde saturado).
export function LogoBadge({
  src,
  alt,
  size = 148,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute rounded-full opacity-50 blur-sm"
        style={{
          inset: -size * 0.25,
          background: "radial-gradient(circle, var(--gx-accent) 0%, transparent 68%)",
        }}
      />
      <img
        src={src}
        alt={alt}
        className="relative h-full w-full rounded-full object-cover"
        style={{ border: "1px solid color-mix(in srgb, var(--gx-accent) 25%, transparent)" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/components/LogoBadge.tsx
git commit -m "feat: agrega el componente LogoBadge a packages/ui"
```

---

### Task 3: Conectar `packages/theming` (y `packages/ui` en el caso de `apps/kiosk`) a ambas apps

**Files:**
- Modify: `apps/web-admin/package.json`
- Modify: `apps/web-admin/next.config.ts`
- Modify: `apps/kiosk/package.json`
- Modify: `apps/kiosk/next.config.ts`
- Modify: `apps/kiosk/app/globals.css`

**Interfaces:** ninguna — solo wiring de build.

- [ ] **Step 1: Agregar `@gym-app/theming` a `apps/web-admin/package.json`**

Agregar esta línea dentro de `"dependencies"` (junto a `"@gym-app/ui": "*"`):

```json
    "@gym-app/theming": "*",
```

- [ ] **Step 2: Agregar `@gym-app/theming` a `transpilePackages` en `apps/web-admin/next.config.ts`**

```typescript
  transpilePackages: ["@gym-app/domain", "@gym-app/infrastructure", "@gym-app/ui", "@gym-app/theming"],
```

- [ ] **Step 3: Agregar `@gym-app/theming` y `@gym-app/ui` a `apps/kiosk/package.json`**

Agregar estas líneas dentro de `"dependencies"`:

```json
    "@gym-app/theming": "*",
    "@gym-app/ui": "*",
```

- [ ] **Step 4: Agregar `transpilePackages` en `apps/kiosk/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/kiosk no tiene backend propio (ADR: "cero lógica de negocio") —
  // todo se sirve como HTML/JS/CSS estático y habla por HTTP con
  // apps/web-admin (ver lib/api.ts). @gym-app/theming y @gym-app/ui son
  // paquetes de presentación pura (sin Prisma, sin dominio) — agregarlos
  // no viola esa regla.
  output: "export",
  transpilePackages: ["@gym-app/theming", "@gym-app/ui"],
};

export default nextConfig;
```

- [ ] **Step 5: Agregar la fuente de Tailwind para `packages/ui` en `apps/kiosk/app/globals.css`**

Agregar esta línea después de `@import "tailwindcss";` (mismo motivo que en `apps/web-admin`, Plan 9 — Tailwind v4 no escanea paquetes fuera de la carpeta de la app por defecto). `packages/theming` no necesita esta línea — `ThemeStyleTag` no usa clases de Tailwind, solo un `<style>` plano.

```css
@source "../../../packages/ui/**/*.{ts,tsx}";
```

- [ ] **Step 6: Commit**

```bash
git add apps/web-admin/package.json apps/web-admin/next.config.ts apps/kiosk/package.json apps/kiosk/next.config.ts apps/kiosk/app/globals.css
git commit -m "feat: conecta packages/theming (y packages/ui en apps/kiosk) a ambas apps"
```

---

### Task 4: Rediseñar `/login` con el tema real (Opción B)

**Files:**
- Modify: `apps/web-admin/app/login/page.tsx`

**Interfaces:**
- Consumes: `ThemeStyleTag`, `temaAdrenalinaXtreme` (Tarea 1), `LogoBadge` (Tarea 2).

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

La lógica de `manejarSubmit` (fetch a `/api/auth/login`, manejo de error, `router.push("/miembros")`) es exactamente la misma que ya existe — solo cambia el JSX/estilos.

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ThemeStyleTag } from "@gym-app/theming/ThemeStyleTag";
import { temaAdrenalinaXtreme } from "@gym-app/theming/tokens";
import { LogoBadge } from "@gym-app/ui/components/LogoBadge";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setCargando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }

    router.push("/miembros");
  }

  return (
    <>
      <ThemeStyleTag tema={temaAdrenalinaXtreme} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap"
        rel="stylesheet"
      />

      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}
      >
        <div
          className="grid w-full max-w-3xl overflow-hidden rounded-2xl border md:grid-cols-2"
          style={{ borderColor: "var(--gx-edge)", boxShadow: "0 40px 80px -40px rgba(0,0,0,0.75)" }}
        >
          <div className="flex flex-col items-center justify-center gap-6 p-10" style={{ background: "var(--gx-ground)" }}>
            <LogoBadge src="/branding/logo-adrenalina-gym.jpg" alt="Adrenalina Xtreme Gym" />
            <div className="text-center">
              <div className="text-3xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em" }}>
                ADRENALINA <span style={{ color: "var(--gx-accent)" }}>XTREME</span>
              </div>
              <div
                className="mt-1 text-xs uppercase"
                style={{
                  fontFamily: '"Barlow Condensed", sans-serif',
                  fontWeight: 700,
                  letterSpacing: "0.24em",
                  color: "var(--gx-muted-dim)",
                }}
              >
                Gym · Panel de administración
              </div>
            </div>
          </div>

          <form onSubmit={manejarSubmit} className="flex flex-col gap-4 p-10" style={{ background: "var(--gx-surface)" }}>
            <h1 className="text-2xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
              Iniciar sesión
            </h1>

            {error && (
              <p
                className="rounded px-3 py-2 text-sm"
                style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
              >
                {error}
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border px-3 py-2 outline-none"
                style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
              Contraseña
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border px-3 py-2 outline-none"
                style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
              />
            </label>

            <button
              type="submit"
              disabled={cargando}
              className="rounded px-5 py-2 font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
            >
              {cargando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
```

**Nota:** los `<link>` de Google Fonts se renderizan directo en el JSX de esta página (un client component) — React 19 hoistea automáticamente `<title>`/`<meta>`/`<link>` a `<head>` sin importar en qué parte del árbol se rendericen, así que no hace falta un mecanismo especial de Next.js para esto.

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/app/login/page.tsx
git commit -m "feat: rediseña /login con el tema Adrenalina Xtreme (Opción B)"
```

---

### Task 5: Componente `AccessCard` en `apps/kiosk`

**Files:**
- Create: `apps/kiosk/components/AccessCard.tsx`

**Interfaces:**
- Consumes: `ResultadoCheckIn` (`apps/kiosk/lib/api.ts`, Plan 8).
- Produces: `AccessCard` — consumido por la Tarea 6.

- [ ] **Step 1: `apps/kiosk/components/AccessCard.tsx`**

```tsx
import type { ResultadoCheckIn } from "@/lib/api";

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

export function AccessCard({ resultado, hora }: { resultado: ResultadoCheckIn; hora: string }) {
  const activo = resultado.estado === "activo";
  const colorEstado = activo ? "var(--gx-accent)" : "var(--gx-bad)";
  const colorEstadoInk = activo ? "var(--gx-accent-ink)" : "var(--gx-bad-ink)";

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}>
      <div
        className="flex items-center justify-between px-8 py-4 text-2xl"
        style={{ background: colorEstado, color: colorEstadoInk, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <span>{activo ? "✓ Acceso permitido" : "✕ Membresía vencida"}</span>
        <span className="text-sm font-semibold" style={{ fontFamily: '"Barlow", sans-serif' }}>{hora}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-8 p-8">
        <div
          className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full text-3xl"
          style={{ fontFamily: '"Bebas Neue", sans-serif', color: colorEstado, background: "var(--gx-surface-2)", border: `3px solid ${colorEstado}` }}
        >
          {resultado.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image
            <img src={resultado.fotoUrl} alt={resultado.nombre} className="h-full w-full object-cover" />
          ) : (
            iniciales(resultado.nombre)
          )}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-4xl" style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}>
            {resultado.nombre}
          </p>

          <div className="grid grid-cols-2 gap-4 border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                Entrada
              </span>
              <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>{hora}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                Entrenador
              </span>
              <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>{resultado.entrenador ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/kiosk/components/AccessCard.tsx
git commit -m "feat: agrega el componente AccessCard al kiosco"
```

---

### Task 6: Integrar el tema y `AccessCard` en `apps/kiosk`

**Files:**
- Modify: `apps/kiosk/app/layout.tsx`
- Modify: `apps/kiosk/app/page.tsx`

**Interfaces:**
- Consumes: `ThemeStyleTag`, `temaAdrenalinaXtreme` (Tarea 1), `AccessCard` (Tarea 5).

- [ ] **Step 1: Reemplazar el contenido completo de `apps/kiosk/app/layout.tsx`**

A diferencia de `apps/web-admin`, acá `ThemeStyleTag` sí va en el layout raíz — toda la app del kiosco es de esta marca, no hay ninguna pantalla en otro tema (ver Global Constraints).

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistrarServiceWorker } from "./RegistrarServiceWorker";
import { ThemeStyleTag } from "@gym-app/theming/ThemeStyleTag";
import { temaAdrenalinaXtreme } from "@gym-app/theming/tokens";

export const metadata: Metadata = {
  title: "Check-in",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: temaAdrenalinaXtreme.ground,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full" style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}>
        <ThemeStyleTag tema={temaAdrenalinaXtreme} />
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Reemplazar el contenido completo de `apps/kiosk/app/page.tsx`**

La lógica de cola offline, reintento y captura del teclado numérico es exactamente la misma — solo cambia el tipo `Estado` (ahora guarda también la `hora` del check-in) y el JSX de la sección de resultado.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerApiKey } from "@/lib/config";
import { registrarCheckIn, ErrorCheckIn, type ResultadoCheckIn } from "@/lib/api";
import { encolar, listarPendientes } from "@/lib/colaPendientes";
import { reintentarPendientes } from "@/lib/reintentarPendientes";
import { AccessCard } from "@/components/AccessCard";

type Estado =
  | { tipo: "esperando" }
  | { tipo: "procesando" }
  | { tipo: "resultado"; resultado: ResultadoCheckIn; hora: string }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, ver ADR de output: "export")
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
      const hora = new Date().toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });
      setEstado({ tipo: "resultado", resultado, hora });
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
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      {pendientes > 0 && (
        <div className="fixed top-4 right-4 rounded bg-amber-600 px-3 py-1 text-sm text-white">
          {pendientes} pendiente{pendientes === 1 ? "" : "s"} por sincronizar
        </div>
      )}

      <h1 className="text-3xl" style={{ fontFamily: '"Bebas Neue", sans-serif' }}>
        Ingresa tu cédula
      </h1>

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
        className="w-full max-w-xl border-b-4 bg-transparent py-4 text-center text-6xl tracking-widest outline-none"
        style={{ borderColor: "var(--gx-accent)" }}
      />

      <div className="flex min-h-40 w-full items-center justify-center text-center">
        {estado.tipo === "procesando" && <p className="text-2xl">Verificando…</p>}

        {estado.tipo === "resultado" && <AccessCard resultado={estado.resultado} hora={estado.hora} />}

        {estado.tipo === "pendiente" && (
          <p className="text-2xl text-amber-400">
            Sin conexión — el check-in se guardó y se enviará solo cuando vuelva la red.
          </p>
        )}

        {estado.tipo === "error" && (
          <p className="text-2xl" style={{ color: "var(--gx-bad)" }}>
            {estado.mensaje}
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/kiosk/app/layout.tsx apps/kiosk/app/page.tsx
git commit -m "feat: integra el tema Adrenalina Xtreme y AccessCard en el kiosco"
```

---

### Task 7: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Instalar dependencias nuevas**

Run: `npm install`
Expected: exit 0.

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit && cd ../kiosk && npx tsc --noEmit`
Expected: exit 0 en ambos.

- [ ] **Step 3: Build completo**

Run: `cd /home/user/gym-app && npx turbo run build --filter=web-admin --filter=kiosk`
Expected: exit 0 en ambos, sin advertencia de dependencia circular.

- [ ] **Step 4: Lint**

Run: `npx turbo run lint --filter=web-admin --filter=kiosk`
Expected: exit 0.

- [ ] **Step 5: No hay commit en esta tarea** — solo verificación.

---

### Task 8: Probar en el navegador contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración en este plan.

- [ ] **Step 1: Levantar ambas apps**

```powershell
npm run dev
```

(o `cd apps/web-admin && npm run dev` y en otra terminal `cd apps/kiosk && npm run dev`, según cómo ya lo estés corriendo)

- [ ] **Step 2: Ver `/login` con el nuevo tema**

Abrir `http://localhost:3000/login`. Expected: panel izquierdo oscuro con el logo real recortado en círculo y un halo verde suave detrás (sin radar, sin animación), wordmark "ADRENALINA XTREME" con "XTREME" en verde; panel derecho con el formulario. Confirmar que el verde ya no "satura" — debe leerse tranquilo, no como flyer neón.

- [ ] **Step 3: Loguear y confirmar que `/miembros` sigue igual que antes**

Loguear con `admin@gymdemo.com`/`admin1234`. Expected: redirige a `/miembros` con el look de siempre (fondo claro) — **si `/miembros` aparece con el tema oscuro/verde, es un bug de este plan** (el `ThemeStyleTag` se filtró fuera de `/login`).

- [ ] **Step 4: Ver la ficha de acceso en el kiosco**

Configurar el `apiKey` en `http://localhost:3001/config` si hace falta, luego escribir la cédula de un miembro activo del seed (`19141319`, Rayza Aray) y Enter. Expected: tarjeta con banner verde "✓ Acceso permitido", avatar con iniciales "RA" (no tiene `fotoUrl` cargada), nombre en grande, hora de entrada y entrenador.

- [ ] **Step 5: Ver la ficha en estado vencido**

Probar con la cédula de un miembro vencido (`13264442`, Julio César Bastidas, si sigue vencido en el seed). Expected: banner rojo "✕ Membresía vencida", aro del avatar rojo.

- [ ] **Step 6: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Tema dinámico por Organización (`TemaOrganizacion`, `ObtenerTemaOrganizacion`, endpoint de tema para el kiosco sin sesión) — plan aparte, es la pieza que sí toca dominio/infraestructura.
- "Miembro desde"/"Vence" en la ficha de acceso — requiere extender `/api/checkin` primero.
- Migrar `/login` a los componentes `Button`/`Input` de `packages/ui`.
- Reskinning de `/miembros` con este tema — decisión deliberada.
- Flujo de subida de logo/fotos — se sigue usando el archivo estático ya commiteado.

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–7 yo mismo en esta sesión (no requieren la base de datos real), y la Tarea 8 la corres tú.

¿Cuál prefieres?
