# Panel Admin — Pantalla de Miembros (UI real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la primera pantalla real del panel admin (`apps/web-admin`) — listado, alta, edición y baja lógica de `Miembro` — con un layout de navegación compartido, cerrando la brecha de que hoy todo el panel solo se prueba con `curl`.

**Architecture:** Las páginas son Server Components que llaman **directo** a los casos de uso de `packages/domain` ya construidos en el Plan 5 (`listarMiembros`, `crearMiembro`, `obtenerMiembro`, `actualizarMiembro`) — sin pasar por las rutas `/api/miembros*` existentes (esas quedan intactas para consumidores externos). Las mutaciones usan Server Actions de Next.js. `packages/ui` arranca a poblarse con los componentes compartidos (`Button`, `Input`, `Badge`, `Sidebar`) que usa esta pantalla y reutilizarán las siguientes.

**Tech Stack:** Next.js 16 Server Components + Server Actions, `useActionState` de React 19 para manejar errores de formulario sin recargar la página. Sin librerías nuevas.

**Spec:** `docs/ROADMAP.md` (Fase A del roadmap conversado con el usuario — "Panel admin usable"). Decisiones de esta sesión:

| Decisión | Resultado |
|---|---|
| Cómo obtienen datos las páginas | Server Components + Server Actions llaman directo a los casos de uso del dominio — no hay fetch interno a `/api/*`. |
| Primera pantalla | Miembros (listado + alta + edición + baja lógica) — ya tiene toda la API/dominio probado desde el Plan 5. |
| Sistema de diseño | Se empieza a poblar `packages/ui` ahora (antes vacío) — `Button`, `Input`, `Badge`, `Sidebar`, pensando en que `Pagos`/`Planes` (próximos planes) y potencialmente `apps/kiosk` los reutilicen. |
| Navegación | Layout compartido con sidebar (`Miembros`/`Pagos`/`Planes`) desde ahora, aunque solo `Miembros` tenga contenido real todavía — evita rehacer el layout en cada plan siguiente. |

## Global Constraints

- **`cedula` sigue siendo inmutable** una vez creado el miembro (mismo principio del Plan 5) — el campo se deshabilita en el formulario de edición.
- **Todo el scoping sigue siendo por `organizacionId` del usuario en sesión** — las Server Actions y las páginas nunca reciben ni confían en un `organizacionId` del cliente, se lee siempre de la sesión server-side.
- **`packages/ui` depende de `next`/`react` como `peerDependencies`** (no como dependencias propias) — son componentes pensados para consumirse dentro de una app Next.js del monorepo, no una librería agnóstica.
- **Asignar un `Entrenador` desde esta UI queda fuera de alcance** — no existe todavía un caso de uso `ListarEntrenadores` (ninguno de los 7 planes anteriores lo construyó). El formulario no incluye ese campo; se agrega cuando exista esa pieza.
- **Sin paginación** en el listado — mismo criterio que la API REST del Plan 5, se agrega cuando el volumen real lo justifique.
- Nunca ejecutar `git commit`/`git push` automáticamente salvo instrucción explícita del usuario.

---

## Pre-flight: lo que ya existe y se reutiliza

- `packages/domain/use-cases/{CrearMiembro,ListarMiembros,ObtenerMiembro,ActualizarMiembro}.ts` (Plan 5) — se consumen tal cual, sin ningún cambio.
- `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts` (Plan 5) — se instancia igual que en las rutas API.
- `apps/web-admin/lib/prisma.ts`, `apps/web-admin/lib/sesion.ts` (Plan 4) — se reutiliza `prisma`; `sesion.ts` gana una función nueva para Server Components (ver Tarea 2), sin tocar la existente (la usan las rutas API, no se toca su firma).
- `apps/web-admin/app/login/page.tsx` (Plan 4) — se ajusta una sola línea (a dónde redirige tras loguear), nada más.
- `packages/ui/package.json` ya existe con `{"name": "@gym-app/ui", "version": "0.0.0", "private": true}` (scaffold del Plan 1, vacío) — este plan le agrega contenido real por primera vez.

---

### Task 1: Poblar `packages/ui` y conectarlo a `apps/web-admin`

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/components/Button.tsx`
- Create: `packages/ui/components/Input.tsx`
- Create: `packages/ui/components/Badge.tsx`
- Create: `packages/ui/components/Sidebar.tsx`
- Modify: `apps/web-admin/package.json`
- Modify: `apps/web-admin/next.config.ts`
- Modify: `apps/web-admin/app/globals.css`

**Interfaces:**
- Produces: `Button`, `Input`, `Badge`, `Sidebar` (+ `ItemNav`) — consumidos por las Tareas 3, 5, 6, 8.

- [ ] **Step 1: Reemplazar `packages/ui/package.json`**

```json
{
  "name": "@gym-app/ui",
  "version": "0.0.0",
  "private": true,
  "peerDependencies": {
    "next": "*",
    "react": "*"
  }
}
```

- [ ] **Step 2: `packages/ui/components/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "peligro";

const ESTILOS: Record<Variante, string> = {
  primario: "bg-blue-600 hover:bg-blue-500 text-white",
  secundario: "bg-neutral-200 hover:bg-neutral-300 text-neutral-900",
  peligro: "bg-red-600 hover:bg-red-500 text-white",
};

export function Button({
  variant = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante }) {
  return (
    <button
      className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${ESTILOS[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 3: `packages/ui/components/Input.tsx`**

```tsx
import type { InputHTMLAttributes } from "react";

export function Input({
  label,
  name,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-700">
      {label}
      <input
        name={name}
        className={`rounded border border-neutral-300 px-3 py-2 outline-none focus:border-blue-500 ${className}`}
        {...props}
      />
    </label>
  );
}
```

- [ ] **Step 4: `packages/ui/components/Badge.tsx`**

```tsx
import type { ReactNode } from "react";

type Tono = "verde" | "gris";

const ESTILOS: Record<Tono, string> = {
  verde: "bg-green-100 text-green-800",
  gris: "bg-neutral-100 text-neutral-600",
};

export function Badge({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[tono]}`}>{children}</span>;
}
```

- [ ] **Step 5: `packages/ui/components/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ItemNav {
  href: string;
  label: string;
}

export function Sidebar({ items }: { items: ItemNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 p-4">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const activo = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded px-3 py-2 text-sm font-medium ${
                  activo ? "bg-blue-600 text-white" : "text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 6: Agregar la dependencia en `apps/web-admin/package.json`**

Agregar esta línea dentro de `"dependencies"` (junto a `"@gym-app/infrastructure": "*"`):

```json
    "@gym-app/ui": "*",
```

- [ ] **Step 7: Agregar `@gym-app/ui` a `transpilePackages` en `apps/web-admin/next.config.ts`**

```typescript
  transpilePackages: ["@gym-app/domain", "@gym-app/infrastructure", "@gym-app/ui"],
```

- [ ] **Step 8: Agregar la fuente de Tailwind para `packages/ui` en `apps/web-admin/app/globals.css`**

Agregar esta línea justo después de `@import "tailwindcss";` (Tailwind v4 no escanea paquetes fuera de la carpeta de la app por defecto):

```css
@source "../../../packages/ui/**/*.{ts,tsx}";
```

- [ ] **Step 9: Commit**

```bash
git add packages/ui apps/web-admin/package.json apps/web-admin/next.config.ts apps/web-admin/app/globals.css
git commit -m "feat: puebla packages/ui con Button/Input/Badge/Sidebar y lo conecta a web-admin"
```

---

### Task 2: Helper de sesión para Server Components

**Files:**
- Modify: `apps/web-admin/lib/sesion.ts`

**Interfaces:**
- Produces: `obtenerUsuarioDeSesionActual()` — consumido por las Tareas 3, 4, 6, 7, 8.

- [ ] **Step 1: Agregar la función nueva al final del archivo**

`obtenerUsuarioDeSesion(req)` (la función existente) sigue exactamente igual — la usan las rutas API (`Request`/`NextRequest`) y no se toca. Server Components/Actions no reciben un `NextRequest`; leen la cookie con `cookies()` de `next/headers`. Se agrega este import al inicio del archivo:

```typescript
import { cookies } from "next/headers";
```

Y esta función al final:

```typescript
// Igual que obtenerUsuarioDeSesion, pero para Server Components/Actions,
// que no reciben un NextRequest — leen la cookie con next/headers.
export async function obtenerUsuarioDeSesionActual(): Promise<UsuarioAdmin | null> {
  const token = (await cookies()).get(NOMBRE_COOKIE_SESION)?.value;

  if (!token) {
    return null;
  }

  return validarSesion(
    {
      sesiones: new PrismaSesionRepository(prisma),
      usuarios: new PrismaUsuarioAdminRepository(prisma),
    },
    token
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-admin/lib/sesion.ts
git commit -m "feat: agrega obtenerUsuarioDeSesionActual para Server Components/Actions"
```

---

### Task 3: Layout del panel con sidebar + reemplazo de `app/page.tsx`

**Files:**
- Create: `apps/web-admin/app/(panel)/layout.tsx`
- Modify: `apps/web-admin/app/page.tsx`
- Modify: `apps/web-admin/app/login/page.tsx`

**Interfaces:**
- Consumes: `obtenerUsuarioDeSesionActual` (Tarea 2), `Sidebar` (Tarea 1).

- [ ] **Step 1: `apps/web-admin/app/(panel)/layout.tsx`**

El grupo de rutas `(panel)` no agrega ningún segmento a la URL (`/miembros` sigue siendo `/miembros`) — solo comparte este layout entre todas las pantallas protegidas.

```tsx
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { Sidebar } from "@gym-app/ui/components/Sidebar";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioDeSesionActual();

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        items={[
          { href: "/miembros", label: "Miembros" },
          { href: "/pagos", label: "Pagos" },
          { href: "/planes", label: "Planes" },
        ]}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

**Nota:** `/pagos` y `/planes` todavía no tienen página — quedan como enlaces del sidebar sin destino real hasta el próximo plan (dan 404 si se clickean, es esperado).

- [ ] **Step 2: Reemplazar el contenido completo de `apps/web-admin/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";

export default async function Home() {
  const usuario = await obtenerUsuarioDeSesionActual();
  redirect(usuario ? "/miembros" : "/login");
}
```

- [ ] **Step 3: Ajustar el destino tras loguear en `apps/web-admin/app/login/page.tsx`**

Cambiar la línea `router.push("/");` por:

```typescript
    router.push("/miembros");
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web-admin/app/(panel)/layout.tsx" apps/web-admin/app/page.tsx apps/web-admin/app/login/page.tsx
git commit -m "feat: agrega el layout del panel con sidebar y reemplaza la home por un redirect"
```

---

### Task 4: Server Actions de `Miembro`

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/actions.ts`

**Interfaces:**
- Consumes: `crearMiembro`/`CedulaDuplicadaError`, `actualizarMiembro`/`MiembroNoEncontradoError` (Plan 5), `obtenerUsuarioDeSesionActual` (Tarea 2).
- Produces: `crearMiembroAction`, `actualizarMiembroAction`, `darDeBajaAction` — consumidos por las Tareas 5, 7, 8.

- [ ] **Step 1: `apps/web-admin/app/(panel)/miembros/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { crearMiembro, CedulaDuplicadaError } from "@gym-app/domain/use-cases/CrearMiembro";
import { actualizarMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarMiembro";
import type { PlanTipo } from "@gym-app/domain/entities/Miembro";

export interface EstadoFormularioMiembro {
  error?: string;
}

export async function crearMiembroAction(
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const cedula = formData.get("cedula")?.toString().trim();
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || !cedula || Number.isNaN(precioPlan)) {
    return { error: "Nombre, cédula y precio del plan son requeridos." };
  }

  try {
    await crearMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre,
        cedula,
        fechaNacimiento: null,
        celular: formData.get("celular")?.toString() || null,
        fotoUrl: null,
        entrenadorId: null,
        planTipo: (formData.get("planTipo")?.toString() as PlanTipo) ?? "SIN_ENTRENADOR",
        precioPlan,
      }
    );
  } catch (error) {
    if (error instanceof CedulaDuplicadaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/miembros");
  redirect("/miembros");
}

export async function actualizarMiembroAction(
  id: string,
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || Number.isNaN(precioPlan)) {
    return { error: "Nombre y precio del plan son requeridos." };
  }

  try {
    await actualizarMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        id,
        cambios: {
          nombre,
          celular: formData.get("celular")?.toString() || null,
          planTipo: formData.get("planTipo")?.toString() as PlanTipo,
          precioPlan,
        },
      }
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/miembros");
  redirect("/miembros");
}

export async function darDeBajaAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: false } }
  );

  revalidatePath("/miembros");
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/actions.ts"
git commit -m "feat: agrega las Server Actions de Miembro (crear/actualizar/dar de baja)"
```

---

### Task 5: Formulario compartido `FormularioMiembro`

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`

**Interfaces:**
- Consumes: `Button`, `Input` (Tarea 1), `EstadoFormularioMiembro` (Tarea 4).
- Produces: `FormularioMiembro` — consumido por las Tareas 7 y 8.

- [ ] **Step 1: `apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioMiembro } from "./actions";

export interface ValoresFormularioMiembro {
  nombre: string;
  cedula: string;
  celular: string;
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  precioPlan: number;
}

export function FormularioMiembro({
  accion,
  valoresIniciales,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  valoresIniciales?: ValoresFormularioMiembro;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

      <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />

      <Input
        name="cedula"
        label="Cédula"
        required
        disabled={esEdicion}
        defaultValue={valoresIniciales?.cedula}
      />

      <Input name="celular" label="Celular" defaultValue={valoresIniciales?.celular} />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Plan
        <select
          name="planTipo"
          defaultValue={valoresIniciales?.planTipo ?? "SIN_ENTRENADOR"}
          className="rounded border border-neutral-300 px-3 py-2"
        >
          <option value="SIN_ENTRENADOR">Sin entrenador</option>
          <option value="CON_ENTRENADOR">Con entrenador</option>
        </select>
      </label>

      <Input
        name="precioPlan"
        label="Precio del plan (USD)"
        type="number"
        step="0.01"
        required
        defaultValue={valoresIniciales?.precioPlan}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/FormularioMiembro.tsx"
git commit -m "feat: agrega el formulario compartido de alta/edición de Miembro"
```

---

### Task 6: Página `/miembros` (listado)

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/page.tsx`

**Interfaces:**
- Consumes: `listarMiembros` (Plan 5), `obtenerUsuarioDeSesionActual` (Tarea 2), `Button`, `Badge` (Tarea 1).

- [ ] **Step 1: `apps/web-admin/app/(panel)/miembros/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

export default async function PaginaMiembros() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const miembros = await listarMiembros(
    { miembros: new PrismaMemberRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Miembros</h1>
        <Link href="/miembros/nuevo">
          <Button>Nuevo miembro</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Cédula</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Vence</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {miembros.map((miembro) => (
            <tr key={miembro.id} className="border-b">
              <td className="py-2">{miembro.nombre}</td>
              <td className="py-2">{miembro.cedula}</td>
              <td className="py-2">
                {miembro.planTipo === "CON_ENTRENADOR" ? "Con entrenador" : "Sin entrenador"}
              </td>
              <td className="py-2">
                {miembro.fechaVencimiento
                  ? new Date(miembro.fechaVencimiento).toLocaleDateString("es-VE")
                  : "—"}
              </td>
              <td className="py-2">
                <Badge tono={miembro.activo ? "verde" : "gris"}>
                  {miembro.activo ? "Activo" : "Inactivo"}
                </Badge>
              </td>
              <td className="py-2">
                <Link href={`/miembros/${miembro.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {miembros.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-neutral-500">
                Todavía no hay miembros. Creá el primero.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/page.tsx"
git commit -m "feat: agrega la página de listado de Miembros"
```

---

### Task 7: Página `/miembros/nuevo` (alta)

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/nuevo/page.tsx`

**Interfaces:**
- Consumes: `FormularioMiembro` (Tarea 5), `crearMiembroAction` (Tarea 4), `obtenerUsuarioDeSesionActual` (Tarea 2).

- [ ] **Step 1: `apps/web-admin/app/(panel)/miembros/nuevo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { FormularioMiembro } from "../FormularioMiembro";
import { crearMiembroAction } from "../actions";

export default async function PaginaNuevoMiembro() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nuevo miembro</h1>
      <FormularioMiembro accion={crearMiembroAction} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/nuevo/page.tsx"
git commit -m "feat: agrega la página de alta de Miembro"
```

---

### Task 8: Página `/miembros/[id]` (edición + baja lógica)

**Files:**
- Create: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`

**Interfaces:**
- Consumes: `obtenerMiembro`/`MiembroNoEncontradoError` (Plan 5), `FormularioMiembro` (Tarea 5), `actualizarMiembroAction`/`darDeBajaAction` (Tarea 4), `Button` (Tarea 1).

- [ ] **Step 1: `apps/web-admin/app/(panel)/miembros/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction, darDeBajaAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarMiembro({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const miembro = await obtenerMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id }
  ).catch((error) => {
    if (error instanceof MiembroNoEncontradoError) return null;
    throw error;
  });

  if (!miembro) notFound();

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar miembro</h1>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          planTipo: miembro.planTipo,
          precioPlan: miembro.precioPlan,
        }}
      />

      {miembro.activo && (
        <form action={darDeBajaAction.bind(null, id)} className="mt-6">
          <Button variant="peligro" type="submit">
            Dar de baja
          </Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web-admin/app/(panel)/miembros/[id]/page.tsx"
git commit -m "feat: agrega la página de edición y baja lógica de Miembro"
```

---

### Task 9: Build + verificación de tipos (sin DB)

**Files:** ninguno — tarea de verificación.

- [ ] **Step 1: Verificar tipos**

Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build completo**

Run: `cd /home/user/gym-app && npx turbo run build --filter=web-admin`
Expected: exit 0. Deberían aparecer `/`, `/miembros`, `/miembros/nuevo`, `/miembros/[id]` en el resumen de rutas.

- [ ] **Step 3: Lint**

Run: `npx turbo run lint --filter=web-admin`
Expected: exit 0.

- [ ] **Step 4: No hay commit en esta tarea** — solo verificación.

---

### Task 10: Probar en el navegador contra la base real (requiere red — lo corre el usuario)

**Files:** ninguno — tarea de verificación. No hay migración en este plan.

- [ ] **Step 1: Levantar el servidor**

```powershell
npm run dev
```

- [ ] **Step 2: Login y verificar el redirect**

Abrir `http://localhost:3000`, loguear con `admin@gymdemo.com`/`admin1234`. Expected: termina en `/miembros`, con el sidebar mostrando "Miembros" resaltado.

- [ ] **Step 3: Ver el listado**

Expected: aparecen los miembros existentes del seed/pruebas anteriores, con nombre, cédula, plan, fecha de vencimiento y el badge de estado.

- [ ] **Step 4: Crear un miembro nuevo**

Click en "Nuevo miembro", completar el formulario con una cédula nueva, guardar. Expected: vuelve a `/miembros` y el nuevo miembro aparece en la lista.

- [ ] **Step 5: Repetir con la misma cédula (debe mostrar el error inline)**

Crear otro miembro con la misma cédula del Step 4. Expected: la página NO navega, se queda en el formulario con el mensaje "Ya existe un miembro con esa cédula en esta organización." arriba.

- [ ] **Step 6: Editar un miembro**

Click en "Editar" de cualquier fila, cambiar el celular, guardar. Expected: vuelve a `/miembros` y el cambio se refleja (recargar si hace falta para confirmar que persistió).

- [ ] **Step 7: Confirmar que la cédula no se puede editar**

En la misma pantalla de edición, confirmar que el campo Cédula aparece deshabilitado (gris, no editable).

- [ ] **Step 8: Dar de baja un miembro**

En la pantalla de edición, click "Dar de baja". Expected: vuelve a `/miembros`, el miembro ahora muestra el badge "Inactivo", y el botón "Dar de baja" ya no aparece si se vuelve a entrar a editarlo.

- [ ] **Step 9: Probar sin sesión**

Cerrar sesión (borrar la cookie manualmente o usar una ventana de incógnito) y entrar a `http://localhost:3000/miembros` directo. Expected: redirige a `/login`.

- [ ] **Step 10: No hay commit en esta tarea** — es solo verificación.

---

## Fuera de alcance de este plan (explícitamente diferido)

- Pantallas de `Pagos` y `Planes` — el sidebar ya tiene los enlaces, pero dan 404 hasta el próximo plan.
- Asignar `Entrenador` desde el formulario — falta `ListarEntrenadores`, no existe todavía en ningún plan anterior.
- Dashboard general (resumen de activos/vencidos, tasa BCV del día).
- Búsqueda/filtro/paginación en el listado.
- Subida real de `fotoUrl` — el formulario no la incluye todavía (la API ya la soporta como string libre).
- Mostrar/editar el rol o gestionar `UsuarioAdmin` desde la UI (`POST /api/usuarios` sigue solo probado con `curl`).

## Execution Handoff

Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — un subagente fresco por tarea, revisión entre tareas.

**2. Inline Execution** — ejecuto las Tareas 1–9 yo mismo en esta sesión (no requieren la base de datos real), y la Tarea 10 la corres tú.

¿Cuál prefieres?
