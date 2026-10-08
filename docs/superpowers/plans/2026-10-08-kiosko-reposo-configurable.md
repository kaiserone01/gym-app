# Kiosko: ficha en reposo configurable desde el panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que SOCIO y GERENTE editen desde un menú "Kiosko" del panel las frases, la imagen del círculo y la opacidad del fondo de la ficha en reposo, y que el TV lo refleje en ≤ ~30 s sin recargar la APK.

**Architecture:** Tres columnas nuevas en `Sucursal` (migración aditiva). `GET /api/kiosco/estado` devuelve un campo opcional `reposo`. El panel gana `/kiosko/frases` y `/kiosko/imagen` (server actions que validan rol y operan sobre la sucursal activa). El kiosco sondea cada 30 s, memoiza las frases por contenido y pinta el fondo de la ficha con `rgba` (sin `color-mix()`).

**Tech Stack:** Prisma 7 (Postgres) en `packages/db`; dominio puro con Vitest en `packages/domain`; Next.js (web-admin y kiosk); Cloudflare R2 vía `storageR2()`; Vitest en `apps/kiosk`.

**Spec:** `docs/superpowers/specs/2026-10-08-kiosko-reposo-configurable-design.md`.

## Global Constraints

- **Nunca correr `prisma migrate` (ni `migrate dev`/`deploy`) contra la base remota** — la base de `.env` es la de producción. Solo se escribe el archivo de migración a mano y se corre `npm run generate --workspace packages/db` (no toca la base). La migración se aplica sola al arrancar el contenedor tras el deploy.
- Todo cambio al API es aditivo/opcional: un kiosco viejo ignora `reposo`; el kiosco nuevo con un API viejo (sin `reposo`) se ve como hoy.
- Valores: `reposoFrases` vacío ⇒ frases predeterminadas del kiosco (`apps/kiosk/lib/frases.ts`, no se duplican en el panel); `reposoImagenUrl` null ⇒ `/branding/placeholder-profile.jpg` local del kiosco; `reposoOpacidad` entero **20–100**, defecto 100.
- Frases: máx. **60** caracteres cada una y **30** frases; se descartan vacías y duplicadas.
- Permisos: **SOCIO y GERENTE**, validados en servidor (layout y cada server action), no solo ocultando el menú.
- La imagen del reposo se sube a la carpeta `kiosko/` del bucket R2 con `storageR2().subir(...)`. El placeholder original **ya está subido** en `${R2_PUBLIC_URL}/kiosko/placeholder-profile.jpg` (lo hizo el usuario/controlador; no volver a subirlo): el panel lo usa como imagen "actual" cuando no hay una personalizada, así "Ajustar encuadre" funciona (`/api/foto-proxy` solo acepta URLs de `R2_PUBLIC_URL`).
- Kiosco: sin `color-mix()`, `:has`, `backdrop-filter`, blur (WebView de TV antiguo); solo `transform`/`opacity` se animan.
- `AGENTS.md` de `apps/web-admin` y `apps/kiosk` avisa de cambios incompatibles de Next.js: usar solo patrones ya presentes en esos archivos.
- Commits: **un solo renglón en español, sin firma ni trailers** (CLAUDE.md). Tras cada tarea: commit y `git push origin main`.
- No ejecutar el Chrome DevTools MCP.

## Review Focus

1. **Sucursales sin configurar** (todas hoy): el reposo debe verse exactamente igual que ahora — `reposoFrases = []`, `reposoImagenUrl = null`, `reposoOpacidad = 100` (Tasks 1, 4, 5).
2. **Sondeo cada 30 s no debe reiniciar la rotación de frases ni hacer parpadear la imagen** si el contenido no cambió (Task 4 tests de `claveDeFrases`).
3. **Guardar frases vacías / con espacios / duplicadas / de más de 60 caracteres**: no debe romper ni guardar basura (Task 1 tests).
4. **Opacidad fuera de rango o no numérica** en el formulario (p. ej. "abc", 5, 250): se corrige a 20–100, nunca se guarda un valor inválido (Task 1 tests, Task 8).
5. **Usuario sin permiso** (RECEPCION/ENTRENADOR) entrando por URL a `/kiosko/...` o invocando las actions: debe ser rechazado en servidor (Tasks 6–8).

---

### Task 1: Validación de frases y opacidad (dominio)

**Files:**
- Create: `packages/domain/utils/reposoKiosko.ts`
- Test: `packages/domain/utils/reposoKiosko.test.ts`

**Interfaces:**
- Produces: `normalizarFrasesReposo(entrada: readonly string[]): string[]`, `limitarOpacidad(valor: unknown): number`, constantes `MAX_FRASES_REPOSO = 30`, `MAX_LARGO_FRASE_REPOSO = 60`, `OPACIDAD_MINIMA = 20`, `OPACIDAD_MAXIMA = 100`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { limitarOpacidad, normalizarFrasesReposo, MAX_FRASES_REPOSO, MAX_LARGO_FRASE_REPOSO } from "./reposoKiosko";

describe("normalizarFrasesReposo", () => {
  it("recorta espacios y descarta vacías", () => {
    expect(normalizarFrasesReposo(["  HOLA  ", "", "   ", "ADIÓS"])).toEqual(["HOLA", "ADIÓS"]);
  });

  it("descarta duplicadas conservando la primera", () => {
    expect(normalizarFrasesReposo(["A", "B", "A"])).toEqual(["A", "B"]);
  });

  it("corta cada frase al máximo de caracteres", () => {
    const larga = "X".repeat(MAX_LARGO_FRASE_REPOSO + 10);
    expect(normalizarFrasesReposo([larga])[0]).toHaveLength(MAX_LARGO_FRASE_REPOSO);
  });

  it("limita la cantidad de frases", () => {
    const muchas = Array.from({ length: MAX_FRASES_REPOSO + 5 }, (_, i) => `F${i}`);
    expect(normalizarFrasesReposo(muchas)).toHaveLength(MAX_FRASES_REPOSO);
  });

  it("devuelve lista vacía si no hay nada útil", () => {
    expect(normalizarFrasesReposo(["", "  "])).toEqual([]);
  });
});

describe("limitarOpacidad", () => {
  it("acepta valores dentro del rango", () => {
    expect(limitarOpacidad(60)).toBe(60);
    expect(limitarOpacidad("45")).toBe(45);
  });

  it("sube al mínimo y baja al máximo", () => {
    expect(limitarOpacidad(5)).toBe(20);
    expect(limitarOpacidad(250)).toBe(100);
  });

  it("redondea decimales", () => {
    expect(limitarOpacidad(60.6)).toBe(61);
  });

  it("devuelve 100 si el valor no es un número", () => {
    expect(limitarOpacidad("abc")).toBe(100);
    expect(limitarOpacidad(undefined)).toBe(100);
    expect(limitarOpacidad(null)).toBe(100);
    expect(limitarOpacidad("")).toBe(100);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run packages/domain/utils/reposoKiosko.test.ts`
Expected: FAIL (módulo `./reposoKiosko` no existe).

- [ ] **Step 3: Implementar**

```ts
export const MAX_FRASES_REPOSO = 30;
export const MAX_LARGO_FRASE_REPOSO = 60;
export const OPACIDAD_MINIMA = 20;
export const OPACIDAD_MAXIMA = 100;

// Frases de la ficha en reposo: recorta, descarta vacías y duplicadas, y respeta los topes de largo y cantidad.
export function normalizarFrasesReposo(entrada: readonly string[]): string[] {
  const vistas = new Set<string>();
  for (const cruda of entrada) {
    const frase = cruda.trim().slice(0, MAX_LARGO_FRASE_REPOSO).trim();
    if (frase) vistas.add(frase);
  }
  return [...vistas].slice(0, MAX_FRASES_REPOSO);
}

// Opacidad del fondo de la ficha en reposo: entero entre el mínimo (legibilidad) y 100; sin número válido, 100.
export function limitarOpacidad(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return OPACIDAD_MAXIMA;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return OPACIDAD_MAXIMA;
  return Math.min(OPACIDAD_MAXIMA, Math.max(OPACIDAD_MINIMA, Math.round(numero)));
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run packages/domain/utils/reposoKiosko.test.ts` (desde `packages/domain`: `npm test --workspace packages/domain`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/utils/reposoKiosko.ts packages/domain/utils/reposoKiosko.test.ts
git commit -m "agrega la validación de frases y opacidad del reposo del kiosco"
git push origin main
```

---

### Task 2: Columnas de reposo en Sucursal (esquema, migración, entidad, repositorio)

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (modelo `Sucursal`, tras `apiKey`)
- Create: `packages/db/prisma/migrations/20261008100000_sucursal_reposo_kiosko/migration.sql`
- Modify: `packages/domain/entities/Sucursal.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `Sucursal.reposoFrases: string[]`, `Sucursal.reposoImagenUrl: string | null`, `Sucursal.reposoOpacidad: number`; `CambiosSucursal.reposoFrases?`, `.reposoImagenUrl?: string | null`, `.reposoOpacidad?`. `PrismaSucursalRepository.actualizar` ya hace `data: cambios`, así que persiste los tres sin más cambios.

- [ ] **Step 1: Esquema** — en el modelo `Sucursal`, después de la línea de `apiKey`, agregar:

```prisma
  reposoFrases     String[] @default([]) // frases de la ficha en reposo del kiosco; vacío = las predeterminadas
  reposoImagenUrl  String? // imagen del círculo de la ficha en reposo (R2); null = placeholder del kiosco
  reposoOpacidad   Int      @default(100) // % de opacidad del fondo de la ficha en reposo (20–100)
```

- [ ] **Step 2: Migración** (archivo escrito a mano; NO ejecutar migrate):

```sql
-- AlterTable
ALTER TABLE "Sucursal" ADD COLUMN     "reposoFrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reposoImagenUrl" TEXT,
ADD COLUMN     "reposoOpacidad" INTEGER NOT NULL DEFAULT 100;
```

- [ ] **Step 3: Entidad** — en `Sucursal` agregar `reposoFrases: string[]; reposoImagenUrl: string | null; reposoOpacidad: number;` y en `CambiosSucursal` agregar `reposoFrases?: string[]; reposoImagenUrl?: string | null; reposoOpacidad?: number;`.

- [ ] **Step 4: Repositorio** — en `mapear` agregar los tres campos al tipo del parámetro (`reposoFrases: string[]; reposoImagenUrl: string | null; reposoOpacidad: number;`) y al objeto devuelto (`reposoFrases: sucursal.reposoFrases`, etc.).

- [ ] **Step 5: Regenerar cliente y verificar tipos**

Run: `npm run generate --workspace packages/db` y luego `npx tsc --noEmit -p apps/web-admin` y `npx tsc --noEmit -p packages/domain` (y los demás workspaces con tsconfig que construyan `Sucursal`).
Expected: sin errores. Si algún fixture/mocker de tests construye un `Sucursal` literal y falla por los campos nuevos, completarlo con `reposoFrases: [], reposoImagenUrl: null, reposoOpacidad: 100`.
Run: `npm test --workspace packages/domain && npm test --workspace packages/db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma packages/domain/entities/Sucursal.ts packages/infrastructure/persistence/prisma/PrismaSucursalRepository.ts
git commit -m "agrega las columnas de reposo del kiosco a la sucursal"
git push origin main
```
(Si el cliente generado está versionado, incluir también `packages/db/generated`; revisar `git status`.)

---

### Task 3: El API del kiosco devuelve `reposo`

**Files:**
- Modify: `apps/web-admin/app/api/kiosco/estado/route.ts`

**Interfaces:**
- Consumes: `Sucursal.reposoFrases/reposoImagenUrl/reposoOpacidad` (Task 2), `sucursalDeKiosco(req)` (ya existe).
- Produces: JSON `{ sucursalNombre, tasaBcv, reposo: { frases: string[]; imagenUrl: string | null; opacidad: number } }`.

- [ ] **Step 1:** actualizar el comentario de cabecera ("sede, última tasa BCV y la configuración del reposo") y devolver:

```ts
return jsonKiosco(
  {
    sucursalNombre: sucursal.nombre,
    tasaBcv,
    reposo: { frases: sucursal.reposoFrases, imagenUrl: sucursal.reposoImagenUrl, opacidad: sucursal.reposoOpacidad },
  },
  200
);
```

- [ ] **Step 2: Verificar** `npx tsc --noEmit -p apps/web-admin` (sin errores).

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/app/api/kiosco/estado/route.ts
git commit -m "el estado del kiosco entrega frases, imagen y opacidad del reposo"
git push origin main
```

---

### Task 4: El kiosco sondea cada 30 s y usa las frases configuradas

**Files:**
- Modify: `apps/kiosk/lib/api.ts` (tipo `InfoKiosco`)
- Modify: `apps/kiosk/lib/useInfoKiosco.ts` (`REFRESCO_MS`)
- Create: `apps/kiosk/lib/frasesReposo.ts`
- Create: `apps/kiosk/lib/useFrasesReposo.ts`
- Test: `apps/kiosk/lib/frasesReposo.test.ts`
- Modify: `apps/kiosk/app/page.tsx` (usar el hook; mover `useInfoKiosco` antes de `useFraseRotativa`)

**Interfaces:**
- Consumes: `FRASES_REPOSO` (`lib/frases.ts`), `InfoKiosco`.
- Produces: `InfoKiosco.reposo?: { frases: string[]; imagenUrl: string | null; opacidad: number }`; `claveDeFrases(frases: readonly string[] | undefined): string`; `frasesDesdeClave(clave: string): readonly string[]` (clave vacía ⇒ `FRASES_REPOSO`); hook `useFrasesReposo(reposo: InfoKiosco["reposo"]): readonly string[]` con referencia estable mientras el contenido no cambie.

- [ ] **Step 1: Test que falla** (`frasesReposo.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { FRASES_REPOSO } from "./frases";
import { claveDeFrases, frasesDesdeClave } from "./frasesReposo";

describe("frasesReposo", () => {
  it("sin frases configuradas usa las predeterminadas", () => {
    expect(frasesDesdeClave(claveDeFrases(undefined))).toBe(FRASES_REPOSO);
    expect(frasesDesdeClave(claveDeFrases([]))).toBe(FRASES_REPOSO);
  });

  it("con frases configuradas las devuelve en el mismo orden", () => {
    expect(frasesDesdeClave(claveDeFrases(["UNA", "DOS"]))).toEqual(["UNA", "DOS"]);
  });

  it("la misma lista da la misma clave aunque sea otro arreglo", () => {
    expect(claveDeFrases(["A", "B"])).toBe(claveDeFrases(["A", "B"]));
    expect(claveDeFrases(["A", "B"])).not.toBe(claveDeFrases(["B", "A"]));
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/frasesReposo.test.ts` desde `apps/kiosk` → FAIL.

- [ ] **Step 3: Implementar**

`lib/frasesReposo.ts`:
```ts
import { FRASES_REPOSO } from "./frases";

// Las frases de la sucursal se comparan por contenido (clave de texto): el sondeo devuelve un arreglo nuevo
// cada vez y, si se usara su identidad, la rotación de frases se reiniciaría cada 30 s.
const SEPARADOR = "\u0000";

export function claveDeFrases(frases: readonly string[] | undefined): string {
  return (frases ?? []).join(SEPARADOR);
}

export function frasesDesdeClave(clave: string): readonly string[] {
  return clave ? clave.split(SEPARADOR) : FRASES_REPOSO;
}
```

`lib/useFrasesReposo.ts`:
```ts
import { useMemo } from "react";
import type { InfoKiosco } from "./api";
import { claveDeFrases, frasesDesdeClave } from "./frasesReposo";

// Frases del reposo: las de la sucursal si hay, si no las predeterminadas. La referencia solo cambia si
// cambia el contenido.
export function useFrasesReposo(reposo: InfoKiosco["reposo"]): readonly string[] {
  const clave = claveDeFrases(reposo?.frases);
  return useMemo(() => frasesDesdeClave(clave), [clave]);
}
```

`lib/api.ts` — en `InfoKiosco` agregar:
```ts
  // Configuración del reposo hecha desde el panel (menú Kiosko); ausente en un API viejo.
  reposo?: { frases: string[]; imagenUrl: string | null; opacidad: number };
```
y actualizar el comentario de arriba ("Sede, tasa BCV y configuración del reposo").

`lib/useInfoKiosco.ts`: `const REFRESCO_MS = 30_000;` y ajustar el comentario superior ("Sede, tasa y configuración del reposo…").

`app/page.tsx`: quitar el import de `FRASES_REPOSO` si queda sin uso, importar `useFrasesReposo`, y reordenar:
```ts
const info = useInfoKiosco(apiKey);
const frasesReposo = useFrasesReposo(info?.reposo);
const { frase, saliendo } = useFraseRotativa(frasesReposo);
```

- [ ] **Step 4: Verificar** `npm test --workspace apps/kiosk` (PASS), `npx tsc --noEmit -p apps/kiosk`, `npm run lint --workspace apps/kiosk` (0 errores).

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk
git commit -m "el kiosco consulta cada 30 s y usa las frases del reposo configuradas en el panel"
git push origin main
```

---

### Task 5: Imagen y opacidad en la ficha en reposo (kiosco)

**Files:**
- Modify: `apps/kiosk/lib/tonos.ts` (agregar `fondoFicha`)
- Test: `apps/kiosk/lib/tonos.test.ts` (crear si no existe)
- Modify: `apps/kiosk/components/MarcoFicha.tsx` (prop `opacidadFondo`)
- Modify: `apps/kiosk/components/FichaReposo.tsx` (props `imagenUrl`, `opacidad`)
- Modify: `apps/kiosk/app/page.tsx` (pasar `imagenUrl` y `opacidad` a `FichaReposo`)

**Interfaces:**
- Consumes: `InfoKiosco["reposo"]` (Task 4).
- Produces: `fondoFicha(opacidad?: number): string` → `"var(--gx-surface)"` si `opacidad` es undefined o ≥ 100; si no `rgba(18, 22, 13, α)` con `α = opacidad / 100` (18,22,13 = `#12160d`, el `surface` de `temaAdrenalinaXtreme`). `MarcoFicha` acepta `opacidadFondo?: number`. `FichaReposo` acepta `imagenUrl?: string | null` y `opacidad?: number`.

- [ ] **Step 1: Test que falla** (`lib/tonos.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { fondoFicha } from "./tonos";

describe("fondoFicha", () => {
  it("sin opacidad o al 100 % usa el token de superficie", () => {
    expect(fondoFicha()).toBe("var(--gx-surface)");
    expect(fondoFicha(100)).toBe("var(--gx-surface)");
  });

  it("por debajo de 100 usa rgba con esa transparencia", () => {
    expect(fondoFicha(60)).toBe("rgba(18, 22, 13, 0.6)");
    expect(fondoFicha(20)).toBe("rgba(18, 22, 13, 0.2)");
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/tonos.test.ts` (desde `apps/kiosk`) → FAIL.

- [ ] **Step 3: Implementar**

`lib/tonos.ts` (al final):
```ts
// Fondo de la ficha: con menos de 100 % de opacidad deja ver el video. rgba fijo (el `surface` de
// temaAdrenalinaXtreme, #12160d) por la misma razón que arriba: sin color-mix().
export function fondoFicha(opacidad?: number): string {
  if (opacidad === undefined || opacidad >= 100) return "var(--gx-surface)";
  return `rgba(18, 22, 13, ${opacidad / 100})`;
}
```

`MarcoFicha.tsx`: importar `fondoFicha`, agregar prop `opacidadFondo?: number` y usar `background: fondoFicha(opacidadFondo)` en lugar de `"var(--gx-surface)"`.

`FichaReposo.tsx`: agregar props `imagenUrl?: string | null` y `opacidad?: number`; `<MarcoFicha color="var(--gx-edge)" opacidadFondo={opacidad}>`; la imagen: `src={imagenUrl ?? "/branding/placeholder-profile.jpg"}` y `className={`h-full w-full object-cover${imagenUrl ? "" : " scale-[1.25]"}`}` (la subida ya viene encuadrada desde el panel; solo el placeholder necesita ampliarse para esconder su aro claro). Actualizar el comentario del `scale`.

`page.tsx`: en `<FichaReposo … />` agregar `imagenUrl={info?.reposo?.imagenUrl ?? null}` y `opacidad={info?.reposo?.opacidad}`.

- [ ] **Step 4: Verificar** `npm test --workspace apps/kiosk` (PASS), `npx tsc --noEmit -p apps/kiosk`, `npm run lint --workspace apps/kiosk`.

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk
git commit -m "la ficha en reposo del kiosco usa la imagen y la opacidad configuradas"
git push origin main
```

---

### Task 6: Menú "Kiosko", permisos y estructura de rutas (panel)

**Files:**
- Create: `apps/web-admin/lib/permisoKiosko.ts`
- Create: `apps/web-admin/app/(panel)/kiosko/tabs.ts`
- Create: `apps/web-admin/app/(panel)/kiosko/layout.tsx`
- Create: `apps/web-admin/app/(panel)/kiosko/page.tsx`
- Modify: `apps/web-admin/app/(panel)/layout.tsx` (ítem entre Miembros y Configuraciones)
- Modify: `apps/web-admin/app/(panel)/MasSheet.tsx` (enlace "Kiosko" en móvil)

**Interfaces:**
- Produces: `puedeEditarKiosko(rol: string): boolean` (SOCIO o GERENTE); `TABS_KIOSKO = [{ href: "/kiosko/frases", label: "Frases" }, { href: "/kiosko/imagen", label: "Imagen" }]`.

- [ ] **Step 1:** `lib/permisoKiosko.ts`:
```ts
// Quién puede configurar la ficha en reposo del kiosco (menú Kiosko).
export function puedeEditarKiosko(rol: string): boolean {
  return rol === "SOCIO" || rol === "GERENTE";
}
```

- [ ] **Step 2:** `kiosko/tabs.ts`:
```ts
export const TABS_KIOSKO = [
  { href: "/kiosko/frases", label: "Frases" },
  { href: "/kiosko/imagen", label: "Imagen" },
];
```

- [ ] **Step 3:** `kiosko/layout.tsx` (mismo patrón que `configuraciones/layout.tsx`):
```tsx
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { TabsConfiguraciones } from "../configuraciones/TabsConfiguraciones";
import { TABS_KIOSKO } from "./tabs";

export default async function LayoutKiosko({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!puedeEditarKiosko(sesion.usuario.rol)) redirect("/miembros");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Kiosko</PageHeader>
      </div>

      <TabsConfiguraciones tabs={TABS_KIOSKO} />

      {children}
    </div>
  );
}
```

- [ ] **Step 4:** `kiosko/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function PaginaKiosko() {
  redirect("/kiosko/frases");
}
```

- [ ] **Step 5:** `(panel)/layout.tsx` — importar `puedeEditarKiosko` y, entre `Miembros` y el ítem de Configuraciones, agregar `...(puedeEditarKiosko(usuario.rol) ? [{ href: "/kiosko", label: "Kiosko" }] : []),`. `MasSheet.tsx` — agregar a `enlaces`, después de Productos: `...(puedeEditarKiosko(rol) ? [{ href: "/kiosko", label: "Kiosko" }] : []),` (importar la función; ruta de import `@/lib/permisoKiosko`).

- [ ] **Step 6: Verificar** `npx tsc --noEmit -p apps/web-admin` y `npm run lint --workspace apps/web-admin` (0 errores nuevos).

- [ ] **Step 7: Commit**

```bash
git add apps/web-admin
git commit -m "agrega el menú Kiosko al panel con permisos para socio y gerente"
git push origin main
```

---

### Task 7: Pestaña Frases (panel)

**Files:**
- Create: `apps/web-admin/app/(panel)/kiosko/actions.ts`
- Create: `apps/web-admin/app/(panel)/kiosko/frases/page.tsx`
- Create: `apps/web-admin/app/(panel)/kiosko/frases/FormularioFrases.tsx`

**Interfaces:**
- Consumes: `normalizarFrasesReposo`, `MAX_FRASES_REPOSO`, `MAX_LARGO_FRASE_REPOSO` (Task 1), `puedeEditarKiosko` (Task 6), `PrismaSucursalRepository.actualizar/buscarPorId`, `conMensajeOk` (`../redirectConMensaje`), `obtenerUsuarioDeSesionActual`.
- Produces: `EstadoFormularioKiosko = { error?: string }` y `guardarFrasesAction(_estadoPrevio, formData)` en `kiosko/actions.ts` (este archivo lo extiende la Task 8).

- [ ] **Step 1: `kiosko/actions.ts`** (`"use server"`, mismo estilo que `configuraciones/actions.ts`):

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { normalizarFrasesReposo } from "@gym-app/domain/utils/reposoKiosko";
import type { CambiosSucursal } from "@gym-app/domain/entities/Sucursal";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioKiosko {
  error?: string;
}

const SIN_PERMISO = "Solo el socio o el gerente pueden configurar el kiosko.";

// Sesión válida con permiso de kiosko; si falta la sesión redirige al login, si falta el permiso devuelve null.
async function sesionConPermiso() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  return puedeEditarKiosko(sesion.usuario.rol) ? sesion : null;
}

// Guarda los cambios de reposo en la sucursal activa (siempre dentro de la organización del usuario).
async function actualizarReposo(sesion: NonNullable<Awaited<ReturnType<typeof sesionConPermiso>>>, cambios: CambiosSucursal) {
  const { usuario, sucursalActivaId } = sesion;
  return new PrismaSucursalRepository(prisma).actualizar(usuario.organizacionId, sucursalActivaId, cambios);
}

export async function guardarFrasesAction(
  _estadoPrevio: EstadoFormularioKiosko,
  formData: FormData
): Promise<EstadoFormularioKiosko> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const frases = normalizarFrasesReposo(formData.getAll("frase").map((valor) => valor.toString()));
  const sucursal = await actualizarReposo(sesion, { reposoFrases: frases });
  if (!sucursal) return { error: "No se encontró la sucursal activa." };

  revalidatePath("/kiosko/frases");
  redirect(conMensajeOk("/kiosko/frases", frases.length ? "Frases guardadas." : "Frases quitadas: el kiosco usará las predeterminadas."));
}
```

- [ ] **Step 2: `frases/page.tsx`** (server): obtener sesión (redirigir al login si falta; el layout ya valida el rol), buscar la sucursal con `new PrismaSucursalRepository(prisma).buscarPorId(usuario.organizacionId, sucursalActivaId)` y renderizar `<FormularioFrases frasesIniciales={sucursal?.reposoFrases ?? []} />` dentro de un `Card` (`@gym-app/ui/components/Card`) con un párrafo explicativo: "Se muestran una a una en la ficha en reposo del kiosco de esta sucursal. Si no hay ninguna, el kiosco usa sus frases predeterminadas. Los cambios llegan al kiosco en menos de 30 segundos."

- [ ] **Step 3: `frases/FormularioFrases.tsx`** (`"use client"`, patrón de `FormularioProducto`: `useActionState`, `useFeedback().mostrarError`):
  - Estado local `frases: string[]` iniciado con `frasesIniciales` (o `[""]` si está vacío).
  - Cada fila: `<input name="frase" maxLength={MAX_LARGO_FRASE_REPOSO}>` (importar la constante desde `@gym-app/domain/utils/reposoKiosko`) y un `Button type="button"` "Quitar" que la elimina; botón "Agregar frase" (deshabilitado al llegar a `MAX_FRASES_REPOSO`) que agrega `""`; `Button type="submit"` "Guardar" (deshabilitado mientras `enviando`).
  - Inputs controlados con `value`/`onChange` (la lista cambia de tamaño); `key` por índice estable es aceptable porque las filas no se reordenan.
  - `useEffect` que llama `mostrarError(estado.error)` cuando llega un error nuevo (copiar el patrón de `FormularioProducto`, incluido el comentario de eslint-disable).

- [ ] **Step 4: Verificar** `npx tsc --noEmit -p apps/web-admin`, `npm run lint --workspace apps/web-admin`. Prueba manual (si el entorno lo permite, sin Chrome DevTools MCP): `npm run dev --workspace apps/web-admin`, entrar como SOCIO a `/kiosko/frases`, guardar dos frases y comprobar el mensaje y la persistencia al recargar.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin
git commit -m "agrega la pestaña Frases del menú Kiosko para editar las frases del reposo"
git push origin main
```

---

### Task 8: Pestaña Imagen y opacidad (panel)

**Files:**
- Modify: `apps/web-admin/app/(panel)/kiosko/actions.ts` (agregar acciones de imagen/opacidad)
- Create: `apps/web-admin/app/(panel)/kiosko/imagen/page.tsx`
- Create: `apps/web-admin/app/(panel)/kiosko/imagen/FormularioImagenKiosko.tsx`

**Interfaces:**
- Consumes: `limitarOpacidad`, `OPACIDAD_MINIMA`, `OPACIDAD_MAXIMA` (Task 1), `sesionConPermiso`/`actualizarReposo`/`EstadoFormularioKiosko` (Task 7), `storageR2` (`@/lib/storageR2`), `SelectorFotoPerfil` (`../../miembros/SelectorFotoPerfil`, props: `tieneFoto`, `fotoActualUrl`, `alGuardarAjuste(archivo: File) => Promise<void>`, `onCambio(archivo: File)`, `etiqueta`).
- Produces: `guardarImagenReposoAction(_estadoPrevio, formData)` (lee `foto` opcional y `opacidad`), `actualizarImagenReposoAction(formData): Promise<{ imagenUrl?: string; error?: string }>` (guarda al instante el encuadre ajustado), `restablecerImagenReposoAction(): Promise<void>` (pone `reposoImagenUrl = null`).

- [ ] **Step 1: Acciones** — agregar a `kiosko/actions.ts` (importar `randomUUID` de `crypto`, `storageR2`, `limitarOpacidad`):

```ts
// Sube la imagen a la carpeta "kiosko" del bucket R2 y devuelve su URL pública.
async function guardarImagen(archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const nombreArchivo = `${randomUUID()}.${extension}`;
  const contenido = Buffer.from(await archivo.arrayBuffer());

  return storageR2().subir("kiosko", nombreArchivo, contenido, archivo.type || "image/jpeg");
}

export async function guardarImagenReposoAction(
  _estadoPrevio: EstadoFormularioKiosko,
  formData: FormData
): Promise<EstadoFormularioKiosko> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const imagenUrl = await guardarImagen(formData.get("foto"));
  const cambios: CambiosSucursal = { reposoOpacidad: limitarOpacidad(formData.get("opacidad")) };
  if (imagenUrl) cambios.reposoImagenUrl = imagenUrl;

  const sucursal = await actualizarReposo(sesion, cambios);
  if (!sucursal) return { error: "No se encontró la sucursal activa." };

  revalidatePath("/kiosko/imagen");
  redirect(conMensajeOk("/kiosko/imagen", "Cambios guardados."));
}

// "Ajustar encuadre": guarda solo la imagen, al instante, sin esperar al "Guardar" del formulario.
export async function actualizarImagenReposoAction(formData: FormData): Promise<{ imagenUrl?: string; error?: string }> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const imagenUrl = await guardarImagen(formData.get("foto"));
  if (!imagenUrl) return { error: "No se recibió la imagen." };

  const sucursal = await actualizarReposo(sesion, { reposoImagenUrl: imagenUrl });
  if (!sucursal) return { error: "No se encontró la sucursal activa." };

  revalidatePath("/kiosko/imagen");
  return { imagenUrl };
}

export async function restablecerImagenReposoAction(): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) redirect(conMensajeOk("/miembros", SIN_PERMISO));

  await actualizarReposo(sesion, { reposoImagenUrl: null });
  revalidatePath("/kiosko/imagen");
  redirect(conMensajeOk("/kiosko/imagen", "Imagen original restablecida."));
}
```
(Si `conMensajeOk` no sirve para mensajes de error, devolver simplemente `redirect("/miembros")` en el caso sin permiso.)

- [ ] **Step 2: `imagen/page.tsx`** (server): sesión + `buscarPorId` de la sucursal activa. `imagenPlaceholderR2 = \`${process.env.R2_PUBLIC_URL}/kiosko/placeholder-profile.jpg\``; `imagenActual = sucursal?.reposoImagenUrl ?? imagenPlaceholderR2`. Renderiza `<FormularioImagenKiosko imagenActualUrl={imagenActual} esPersonalizada={!!sucursal?.reposoImagenUrl} opacidadInicial={sucursal?.reposoOpacidad ?? 100} />` dentro de `Card`, con texto: "Imagen del círculo y transparencia del fondo de la ficha en reposo del kiosco. Los cambios llegan en menos de 30 segundos."

- [ ] **Step 3: `imagen/FormularioImagenKiosko.tsx`** (`"use client"`):
  - Estado: `previewUrl` (inicia con `imagenActualUrl`), `opacidad` (inicia con `opacidadInicial`).
  - `<form action={enviar}>` con `useActionState(guardarImagenReposoAction, {})`, `useFeedback().mostrarError` para `estado.error`.
  - Círculo de vista previa (`h-40 w-40 rounded-full overflow-hidden`, `<img object-cover>`, mismo `eslint-disable` que `FormularioProducto`) + `SelectorFotoPerfil` con `tieneFoto`, `fotoActualUrl={imagenActualUrl}`, `etiqueta="Imagen del reposo"`, `guiaCircular={false}`, `onCambio` (actualiza `previewUrl` con `URL.createObjectURL`, liberando el blob anterior como en `FormularioProducto`) y `alGuardarAjuste` (llama `actualizarImagenReposoAction` con un `FormData` que lleva `foto`, y con `imagenUrl` actualiza `previewUrl`; si devuelve `error`, `mostrarError`). Ver cómo `FormularioMiembro` pasa `alGuardarAjuste` y copiar el patrón de FormData.
  - Deslizador `<input type="range" min={OPACIDAD_MINIMA} max={OPACIDAD_MAXIMA} step={5} name="opacidad" value={opacidad}>` con etiqueta "Opacidad del fondo" y el valor en %.
  - Vista previa en vivo: contenedor con fondo de ondas simuladas (`background: "repeating-linear-gradient(135deg, #0a0d07 0 16px, #1f3a12 16px 32px)"`) y encima una caja con `background: \`rgba(18, 22, 13, ${opacidad / 100})\`` que contiene el círculo de vista previa y dos líneas de texto de ejemplo ("FRASE DE EJEMPLO"). Comentar que replica `fondoFicha` del kiosco.
  - Botón "Guardar" (`type="submit"`) y, solo si `esPersonalizada`, `<button formAction={restablecerImagenReposoAction}>` "Restablecer imagen original" (`Button` con variante secundaria si existe; revisar `packages/ui/components/Button.tsx`).

- [ ] **Step 4: Verificar** `npx tsc --noEmit -p apps/web-admin`, `npm run lint --workspace apps/web-admin`, `npm test --workspace packages/domain`. Prueba manual: `/kiosko/imagen` como SOCIO → mover opacidad y ver la vista previa; "Ajustar encuadre" sobre la imagen actual guarda al instante; "Restablecer" vuelve al placeholder. Como RECEPCION, `/kiosko/imagen` redirige a `/miembros`.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin
git commit -m "agrega la pestaña Imagen del menú Kiosko con encuadre y opacidad del reposo"
git push origin main
```

---

### Task 9: Cierre — compilación completa, documentación y handoff

**Files:**
- Modify: `handoff.md` (5 secciones; NO borrar entradas de "Intentos fallidos")
- Modify: `apps/kiosk-tv/README.md` (una nota: la configuración del reposo se cambia desde el panel y no requiere recompilar la APK)

- [ ] **Step 1:** `NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build --workspace apps/kiosk` y `npm run build --workspace apps/web-admin` (pueden tardar varios minutos; ejecutar en segundo plano). Expected: compilan sin errores. Correr también `npm test --workspace packages/domain`, `npm test --workspace packages/db`, `npm test --workspace apps/kiosk`.

- [ ] **Step 2:** `handoff.md`: reflejar el menú Kiosko, las tres columnas, el endpoint ampliado, el sondeo de 30 s, el placeholder subido a `kiosko/placeholder-profile.jpg` en R2, y los pasos de despliegue (respaldar BD → desplegar web-admin → desplegar `apps/kiosk`; **no** recompilar la APK). Agregar a "Próximos pasos": probar en el TV real que la opacidad se vea bien y que el cambio llegue en ≤ 30 s.

- [ ] **Step 3: Commit**

```bash
git add handoff.md apps/kiosk-tv/README.md
git commit -m "actualiza el handoff y la guía del kiosco con la configuración del reposo desde el panel"
git push origin main
```
