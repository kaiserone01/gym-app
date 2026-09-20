# Replanificación de Caja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reordenar Caja en el menú, fijar la zona horaria de Venezuela globalmente, mostrar un reloj + tasa BCV en todo el panel, corregir el bug de selección de sucursal al abrir turno, simplificar `/caja` a solo el formulario de apertura, y migrar el reporte histórico de turnos a `/pagos` (renombrada "Histórico de Pagos") con un calendario de rango en español que deshabilita días sin actividad.

**Architecture:** Cambios incrementales sobre código existente, sin nuevas tablas ni migraciones. Se añade un método al puerto `ITurnoRepository` (+ su implementación Prisma) para listar los días con turnos, un caso de uso fino que lo envuelve, un helper de sucursales visibles para Caja (mismo patrón que el ya existente para Miembros), y dos componentes cliente nuevos (`RelojYTasa`, `SelectorRangoFechas`). La página `/caja` se recorta a la mitad de su tamaño actual; la página `/pagos` gana la otra mitad del contenido que `/caja` pierde.

**Tech Stack:** Next.js 16 (Server Components + Client Components), Prisma 7 (raw query para truncar fechas a día), `react-day-picker@10.0.1` (nueva dependencia, calendario de rango localizado a español).

**Spec:** `docs/superpowers/specs/2026-09-20-replanificacion-caja-design.md`

## Global Constraints

- No hay test runner (Jest/Vitest) en este proyecto — la verificación de cada tarea es: build limpio (`npx tsc --noEmit` + `npm run build --workspace apps/web-admin`) y, cuando aplica, un script `tsx` desechable contra la base de datos real (se borra después de usarlo, nunca se commitea).
- Los cambios de dominio siguen el patrón hexagonal existente: `packages/domain` (entidades, puertos, casos de uso) → `packages/infrastructure` (implementación Prisma) → `apps/web-admin` (Server Components/Actions que inyectan las dependencias).
- `TZ=America/Caracas` se fija vía variable de entorno de proceso — no se toca lógica de negocio para timezone.
- Todo texto de UI en español, siguiendo el estilo ya usado en el proyecto (tono directo, sin trato formal excesivo).
- La ruta `/pagos` NO cambia de URL (solo cambia su contenido y el label del menú) — mismo patrón ya usado al mover Planes/Sucursales/Usuarios a tabs de Configuraciones sin cambiar sus URLs.
- Fuera de alcance: exportar a Excel/XLS (tarea separada futura), eliminar la sección Pagos, rediseñar la pantalla de "turno activo".

---

## Task 1: `TZ=America/Caracas` en los 3 apps

**Files:**
- Modify: `.env` (raíz del monorepo)
- Modify: `apps/web-admin/.env`
- Modify: `apps/kiosk/.env.local`
- Modify: `Dockerfile` (raíz, imagen de `web-admin`)
- Modify: `apps/kiosk/Dockerfile`

**Interfaces:**
- Consumes: nada de tareas anteriores (primera tarea).
- Produces: nada que otras tareas consuman directamente — es una variable de entorno de proceso, no una interfaz de código. Las Tareas 3-7 asumen que `new Date()` ya refleja la hora de Venezuela cuando corren en local/CI, pero no dependen de ningún símbolo exportado por esta tarea.

- [ ] **Step 1: Agregar `TZ` a los `.env` de desarrollo**

Abrí `C:\dev\gym-app\.env` y agregá esta línea al final (después de las variables de R2):

```
TZ=America/Caracas
```

Hacé lo mismo en `C:\dev\gym-app\apps\web-admin\.env` (agregar la línea `TZ=America/Caracas` al final) y en `C:\dev\gym-app\apps\kiosk\.env.local` (agregar la línea `TZ=America/Caracas` al final).

`apps/worker` no tiene su propio `.env` — `apps/worker/src/actualizar-tasa.ts` carga explícitamente el `.env` de la raíz del monorepo (`config({ path: path.resolve(process.cwd(), "../../.env") })`), así que la línea que acabás de agregar al `.env` raíz ya lo cubre. Node.js permite fijar `process.env.TZ` en tiempo de ejecución (no solo al arrancar el proceso) y que afecte los `Date`/`Intl` que se creen después — por eso alcanza con que `dotenv.config()` corra antes de cualquier `new Date()` en ese script, que es exactamente el orden actual del archivo.

- [ ] **Step 2: Verificar que Node respeta la variable localmente**

Ejecutá esto desde la raíz del repo para confirmar que Node.js toma la variable:

```bash
TZ=America/Caracas node -e "console.log(new Date().toString())"
```

Expected: la fecha impresa termina en `GMT-0400 (Venezuela Time)` o similar (no `GMT+0000` ni otra zona).

- [ ] **Step 3: Fijar `TZ` en el Dockerfile de `web-admin`**

Abrí `C:\dev\gym-app\Dockerfile`, buscá el bloque `runner` (empieza en `FROM node:${NODE_VERSION} AS runner`), donde ya están estas líneas:

```dockerfile
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
```

Agregá una línea nueva justo después:

```dockerfile
ENV TZ=America/Caracas
```

- [ ] **Step 4: Fijar `TZ` en el Dockerfile de `kiosk`**

Abrí `C:\dev\gym-app\apps\kiosk\Dockerfile`, buscá el bloque `runner` (empieza en `FROM node:${NODE_VERSION} AS runner`), y agregá cerca de las otras `ENV` de ese bloque:

```dockerfile
ENV TZ=America/Caracas
```

Si ese bloque no tiene ninguna otra línea `ENV` antes del `EXPOSE`/`CMD`, agregala inmediatamente antes del `EXPOSE`.

- [ ] **Step 5: Verificar que `apps/worker` toma la variable del `.env` raíz**

```bash
cd /c/dev/gym-app/apps/worker
node -e "
require('dotenv').config({ path: require('path').resolve(process.cwd(), '../../.env') });
console.log(new Date().toString());
"
```

Expected: la fecha impresa termina en `GMT-0400` (Venezuela).

**Nota — mecanismo de despliegue de `apps/worker` desconocido**: este repositorio no tiene ningún archivo de CI/cron (`.yml`/`.yaml`) ni Dockerfile propio para `apps/worker` — no hay forma de confirmar desde el código cómo se ejecuta en producción (¿cron del hosting? ¿tarea programada externa?). Este step solo verifica que, dado que el proceso arranque con acceso al `.env` raíz del monorepo (como ya lo requiere hoy para `DATABASE_URL`), la variable `TZ` agregada en el Step 1 se toma correctamente. Si en producción `apps/worker` corre con variables de entorno inyectadas por la plataforma en vez de leer el `.env` del repo, hay que agregar `TZ=America/Caracas` a esa configuración también — confirmá con quien administra el despliegue de `apps/worker` cuál es el caso antes de considerar esta tarea completa en producción.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/gym-app
git add .env apps/web-admin/.env apps/kiosk/.env.local Dockerfile apps/kiosk/Dockerfile
git commit -m "chore: fija TZ=America/Caracas en dev y en las imagenes Docker de web-admin y kiosk"
```

---

## Task 2: Corregir el bug de sucursal al abrir turno

**Files:**
- Create: `apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts`
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx:40-50` (bloque de carga de datos + JSX del `FormularioAbrirTurno`, ver Task 4 para el resto de esta página)

**Interfaces:**
- Consumes: `SucursalResumen` (`packages/domain/entities/SucursalResumen.ts` — `{ id: string; nombre: string; direccion: string | null; diasGracia: number; activo: boolean }`), `UsuarioAdmin` (`packages/domain/entities/UsuarioAdmin.ts`), `listarSucursales` (`packages/domain/use-cases/ListarSucursales.ts`), `PrismaSucursalRepository`, `PrismaUsuarioSucursalRepository.listarSucursalIdsPorUsuario(usuarioId: string): Promise<string[]>`.
- Produces: `obtenerSucursalesVisiblesParaTurno(usuario: UsuarioAdmin): Promise<SucursalResumen[]>` — usado por Task 4 en `caja/page.tsx`.

- [ ] **Step 1: Crear el helper de sucursales visibles**

Es el mismo patrón ya usado en `apps/web-admin/app/(panel)/miembros/obtenerSucursalesVisibles.ts` — SOCIO ve todas, el resto de roles solo las que tiene asignadas.

Crear `C:\dev\gym-app\apps\web-admin\app\(panel)\caja\obtenerSucursalesVisiblesParaTurno.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Las sucursales entre las que un operador puede elegir al abrir turno:
// SOCIO ve todas las de la organización; Gerente/Recepción solo las que
// tiene asignadas (UsuarioSucursal) — mismo patrón que
// obtenerSucursalesVisiblesParaMiembro en miembros/obtenerSucursalesVisibles.ts.
export async function obtenerSucursalesVisiblesParaTurno(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  const todas = await listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId);

  if (usuario.rol === "SOCIO") {
    return todas;
  }

  const idsAsignados = new Set(
    await new PrismaUsuarioSucursalRepository(prisma).listarSucursalIdsPorUsuario(usuario.id)
  );

  return todas.filter((sucursal) => idsAsignados.has(sucursal.id));
}
```

- [ ] **Step 2: Verificar con un script desechable contra la DB real**

Este proyecto no tiene test runner — la verificación de casos de uso/repositorios se hace con un script `tsx` desechable contra la base real, que se borra apenas confirma el comportamiento. Creá `C:\dev\gym-app\packages\db\check-temp.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { obtenerSucursalesVisiblesParaTurno } from "../../apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno";

const prisma = new PrismaClient();

async function main() {
  // Buscá un usuario SOCIO real de tu organización de prueba y reemplazá el id.
  const socio = await prisma.usuarioAdmin.findFirst({ where: { rol: "SOCIO" } });
  if (!socio) throw new Error("No hay ningún usuario SOCIO en la base — no se puede verificar.");

  const totalSucursales = await prisma.sucursal.count({ where: { organizacionId: socio.organizacionId } });

  const visibles = await obtenerSucursalesVisiblesParaTurno({
    id: socio.id,
    organizacionId: socio.organizacionId,
    sucursalId: socio.sucursalId,
    nombre: socio.nombre,
    telefono: socio.telefono,
    fotoUrl: socio.fotoUrl,
    rol: socio.rol as "SOCIO",
    email: socio.email,
    activo: socio.activo,
  });

  console.log(`Sucursales totales de la organización: ${totalSucursales}`);
  console.log(`Sucursales visibles para el SOCIO: ${visibles.length}`);
  if (visibles.length !== totalSucursales) {
    throw new Error("FALLÓ: un SOCIO debería ver TODAS las sucursales de su organización.");
  }
  console.log("OK: el SOCIO ve todas las sucursales.");
}

main().finally(() => prisma.$disconnect());
```

Nota: este script importa un archivo de `apps/web-admin` (rompe el aislamiento de paquetes) solo para esta verificación puntual — es aceptable porque se borra en el siguiente paso y nunca se commitea.

Ejecutá:

```bash
cd /c/dev/gym-app/packages/db
npx tsx check-temp.ts
```

Expected: imprime `OK: el SOCIO ve todas las sucursales.` sin error. Si tu base de prueba no tiene ningún usuario `SOCIO`, el script lanza el error explicando eso — creá uno de prueba o ajustá el `where` para apuntar a un usuario SOCIO real antes de continuar.

- [ ] **Step 3: Borrar el script desechable**

```bash
cd /c/dev/gym-app/packages/db
rm check-temp.ts
```

- [ ] **Step 4: Commit**

```bash
cd /c/dev/gym-app
git add "apps/web-admin/app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts"
git commit -m "feat: agrega obtenerSucursalesVisiblesParaTurno (mismo patron que Miembros)"
```

---

## Task 3: Componente `RelojYTasa`

**Files:**
- Create: `packages/ui/components/RelojYTasa.tsx`
- Modify: `apps/web-admin/app/(panel)/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/tasa-cambio` (ya existe en `apps/web-admin/app/api/tasa-cambio/route.ts`) — responde `200` con el shape de `TasaCambio` (`{ id: string; fecha: string; valor: number; fuente: string }`, las fechas llegan serializadas como string JSON) o `404` con `{ error: string }` cuando no hay ninguna tasa guardada.
- Produces: `RelojYTasa` (componente sin props) — montado una sola vez en `(panel)/layout.tsx`, visible en todo el panel.

- [ ] **Step 1: Crear el componente**

Crear `C:\dev\gym-app\packages\ui\components\RelojYTasa.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface TasaCambioRespuesta {
  valor: number;
  fuente: string;
}

// Reloj en vivo (hora del navegador del operador) + última tasa BCV
// guardada — visible en una esquina de todo el panel administrativo. La
// hora "real" que usa el sistema para abrir/cerrar turno la fija el
// servidor vía TZ=America/Caracas (ver Task 1 del plan); este reloj es
// solo informativo para quien opera la caja.
export function RelojYTasa() {
  const [ahora, setAhora] = useState<Date | null>(null);
  const [tasa, setTasa] = useState<TasaCambioRespuesta | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const intervalo = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/tasa-cambio")
      .then((res) => (res.ok ? res.json() : null))
      .then((datos: TasaCambioRespuesta | null) => {
        if (!cancelado && datos) setTasa(datos);
      })
      .catch(() => {
        // Sin tasa disponible o error de red — el bloque de tasa simplemente no se muestra.
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Antes del primer render en el cliente `ahora` es null (evita mismatch
  // de hidratación: el servidor no puede saber la hora "del momento en
  // que el cliente ve la pantalla").
  if (!ahora) return null;

  return (
    <div
      className="fixed right-4 top-4 z-40 flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-medium shadow-sm print:hidden"
      style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
    >
      <span>{ahora.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "medium" })}</span>
      {tasa && (
        <>
          <span style={{ color: "var(--gx-edge)" }}>|</span>
          <span style={{ color: "var(--gx-accent)" }}>Bs. {tasa.valor.toFixed(2)} (BCV)</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montar el componente en el layout del panel**

Abrí `C:\dev\gym-app\apps\web-admin\app\(panel)\layout.tsx`. El archivo hoy empieza así:

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { Sidebar } from "@gym-app/ui/components/Sidebar";
import { FeedbackProvider } from "@gym-app/ui/components/FeedbackOverlay";
import { FeedbackDesdeUrl } from "@gym-app/ui/components/FeedbackDesdeUrl";
import { BarraUsuario } from "./BarraUsuario";
import { NavegacionMobile } from "./NavegacionMobile";
```

Agregá el import de `RelojYTasa` después del import de `FeedbackDesdeUrl`:

```tsx
import { RelojYTasa } from "@gym-app/ui/components/RelojYTasa";
```

Luego, dentro del `return`, montá `<RelojYTasa />` junto a `<FeedbackDesdeUrl />` (mismo nivel, ambos antes del `<div className="flex min-h-dvh...">`):

```tsx
  return (
    <FeedbackProvider>
      <Suspense fallback={null}>
        <FeedbackDesdeUrl />
      </Suspense>
      <RelojYTasa />
      <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--gx-ground)" }}>
```

(El resto del archivo, desde `<div className="flex min-h-dvh...">` hasta el cierre, no cambia en este paso — ver Task 6 para el reordenamiento del menú dentro de ese mismo bloque.)

- [ ] **Step 3: Build de verificación**

```bash
cd /c/dev/gym-app
npx tsc --noEmit -p apps/web-admin/tsconfig.json
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
cd /c/dev/gym-app
git add "packages/ui/components/RelojYTasa.tsx" "apps/web-admin/app/(panel)/layout.tsx"
git commit -m "feat: agrega reloj en vivo + tasa BCV visible en todo el panel"
```

---

## Task 4: Simplificar `/caja` (solo abrir turno)

**Files:**
- Modify: `apps/web-admin/app/(panel)/caja/page.tsx` (rama sin turno abierto — líneas 199-364 del archivo actual)

**Interfaces:**
- Consumes: `obtenerSucursalesVisiblesParaTurno` (Task 2), `FormularioAbrirTurno` (sin cambios de props — ya acepta `sucursales: Array<{ id: string; nombre: string }>` y `requiereSucursal: boolean`, ver `apps/web-admin/app/(panel)/caja/FormularioAbrirTurno.tsx`).
- Produces: nada que otras tareas consuman — la rama "con turno abierto" (líneas 40-197 del archivo actual) no se toca en esta tarea.

- [ ] **Step 1: Reemplazar la rama "sin turno abierto"**

Abrí `C:\dev\gym-app\apps\web-admin\app\(panel)\caja\page.tsx`. Los imports actuales de este archivo son:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerResumenTurno } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { BotonImprimir } from "../BotonImprimir";
```

Reemplazalos por (se quitan `obtenerReporteCaja`, `Input`, `BotonImprimir`, `PrismaArqueoRepository` de aquí ya que solo los usaba la rama de reporte que se elimina; se quita también el import de `fechas.ts` porque esa rama dejará de usar `formatearFechaISO`/`inicioDeSemana`/etc.; se agrega `obtenerSucursalesVisiblesParaTurno`):

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerResumenTurno } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { obtenerSucursalesVisiblesParaTurno } from "./obtenerSucursalesVisiblesParaTurno";
```

Nota: `nombreMetodo` (la función identidad definida más abajo en el archivo, líneas 24-30) y `formatearBs` (importado de `../tasaBcvFija`) siguen usándose en la rama de turno activo — no se tocan. El import `import { formatearBs } from "../tasaBcvFija";` se mantiene tal cual está.

- [ ] **Step 2: Reemplazar la firma de la función y la carga de datos de la rama sin turno**

La función hoy empieza así:

```tsx
export default async function PaginaCaja({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; periodo?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursalId = usuario.sucursalId;
  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = sucursalId ? await turnoRepo.buscarAbiertoPorSucursal(sucursalId) : null;
```

`/caja` ya no necesita `searchParams` (esa página deja de aceptar fecha/período). Reemplazá la firma completa por:

```tsx
export default async function PaginaCaja() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursalId = usuario.sucursalId;
  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = sucursalId ? await turnoRepo.buscarAbiertoPorSucursal(sucursalId) : null;
```

(Sin cambios en esta parte más que quitar el parámetro `searchParams` — la lógica de `sucursalId`/`turnoRepo`/`turnoAbierto` es idéntica.)

- [ ] **Step 3: Dejar sin cambios el bloque `if (turnoAbierto)`**

El bloque completo `if (turnoAbierto) { ... }` (desde `const [resumen, miembros, planes, metodosPago, todasLasSucursales] = ...` hasta el `return (...)` que cierra con `);` antes del `}` que cierra el `if`) permanece exactamente igual — no se modifica en esta tarea.

- [ ] **Step 4: Reemplazar todo lo que sigue después del bloque `if (turnoAbierto)`**

Después del `}` que cierra el `if (turnoAbierto) { ... }`, el archivo hoy tiene (desde `const { fecha: fechaTexto, periodo = "dia" } = await searchParams;` hasta el final del archivo, unas 165 líneas que arman el reporte histórico con selector de fecha/período).

Reemplazá **todo ese bloque final** (desde `const { fecha: fechaTexto, periodo = "dia" } = await searchParams;` hasta el `}` que cierra la función, inclusive) por:

```tsx
  const sucursalesVisibles = await obtenerSucursalesVisiblesParaTurno(usuario);

  // Si el operador ya tiene una sucursal fija (la mayoría de Gerente/
  // Recepción) se usa esa sin preguntar. Si no (típicamente un SOCIO), y
  // solo hay una sucursal visible, se toma esa por defecto tampoco. Solo
  // se pregunta cuando hay más de una opción real — antes de esta tarea
  // el formulario siempre recibía sucursales=[] acá, por eso el SOCIO no
  // podía elegir (ver Task 2).
  const requiereSucursal = !sucursalId && sucursalesVisibles.length > 1;
  const sucursalesParaFormulario = requiereSucursal
    ? sucursalesVisibles.map((s) => ({ id: s.id, nombre: s.nombre }))
    : [];

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <PageHeader>Abrir turno</PageHeader>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={requiereSucursal}
        sucursales={sucursalesParaFormulario}
      />
    </div>
  );
}
```

Notá que esta rama ya no necesita `listarSucursales` ni `PrismaSucursalRepository` — solo hace falta la lista de sucursales *visibles* para este operador, no todas las de la organización. La rama de turno activo (que no se toca, ver Step 3) sí sigue usando su propia `todasLasSucursales` calculada con `listarSucursales`/`PrismaSucursalRepository` dentro del `if` — por eso esos dos imports (`listarSucursales`, `PrismaSucursalRepository`) siguen apareciendo en el bloque de imports del Step 1: los sigue usando el `if (turnoAbierto)`, aunque ya no la rama de abajo.

- [ ] **Step 5: Quitar el import y uso de `FormularioAbrirTurno`/`abrirTurnoAction` que falten**

Verificá que el archivo siga importando estas dos líneas (ya estaban antes, no deberían haberse tocado en los Steps 1-2):

```tsx
import { FormularioAbrirTurno } from "./FormularioAbrirTurno";
import { abrirTurnoAction, registrarEgresoAction, cerrarTurnoAction } from "./actions";
```

- [ ] **Step 6: Build de verificación**

```bash
cd /c/dev/gym-app
npx tsc --noEmit -p apps/web-admin/tsconfig.json
```

Expected: sin errores. Si aparece un error de "unused import" para `Input`, `BotonImprimir`, `obtenerReporteCaja`, `PrismaArqueoRepository`, `inicioDelDia`, `finDelDia`, `inicioDeSemana`, `finDeSemana`, `inicioDeMes`, `finDeMes` o `formatearFechaISO`, confirmá que ese import ya no está en el Step 1 (no deberían estar, pero si el editor los dejó, borralos). `listarSucursales` y `PrismaSucursalRepository` sí deben seguir apareciendo (los usa la rama de turno activo, ver la nota del Step 4).

- [ ] **Step 7: Commit**

```bash
cd /c/dev/gym-app
git add "apps/web-admin/app/(panel)/caja/page.tsx"
git commit -m "feat: simplifica /caja a solo el formulario de abrir turno, sin reporte historico ni boton imprimir"
```

---

## Task 5: `listarFechasConTurno` (puerto + Prisma) y caso de uso `obtenerDiasConActividad`

**Files:**
- Modify: `packages/domain/ports/ITurnoRepository.ts`
- Modify: `packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts`
- Create: `packages/domain/use-cases/ObtenerDiasConActividad.ts`

**Interfaces:**
- Consumes: `Turno` (`packages/domain/entities/Turno.ts`), `PrismaClient` (`@gym-app/db/generated/prisma/client`).
- Produces: `ITurnoRepository.listarFechasConTurno(organizacionId: string): Promise<Date[]>`; `obtenerDiasConActividad(deps: { turnos: ITurnoRepository }, organizacionId: string): Promise<Date[]>` — usado por Task 8 (`pagos/page.tsx`).

- [ ] **Step 1: Agregar el método al puerto**

Abrí `C:\dev\gym-app\packages\domain\ports\ITurnoRepository.ts`, que hoy es:

```typescript
import { Turno, DatosNuevoTurno } from "../entities/Turno";

export interface ITurnoRepository {
  crear(datos: DatosNuevoTurno): Promise<Turno>;
  buscarPorId(organizacionId: string, id: string): Promise<Turno | null>;
  buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null>;
  cerrar(id: string, cerradoEn: Date): Promise<Turno>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]>;
}
```

Agregá el nuevo método a la interfaz:

```typescript
import { Turno, DatosNuevoTurno } from "../entities/Turno";

export interface ITurnoRepository {
  crear(datos: DatosNuevoTurno): Promise<Turno>;
  buscarPorId(organizacionId: string, id: string): Promise<Turno | null>;
  buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null>;
  cerrar(id: string, cerradoEn: Date): Promise<Turno>;
  listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]>;
  // Un Date por cada día distinto (en la zona horaria del servidor, ver
  // TZ=America/Caracas) en que se abrió al menos un turno de esta
  // organización — usado para deshabilitar días sin actividad en el
  // calendario de Histórico de Pagos.
  listarFechasConTurno(organizacionId: string): Promise<Date[]>;
}
```

- [ ] **Step 2: Implementar el método en `PrismaTurnoRepository`**

Abrí `C:\dev\gym-app\packages\infrastructure\persistence\prisma\PrismaTurnoRepository.ts`. Agregá este método dentro de la clase `PrismaTurnoRepository`, después de `listarPorOrganizacionYRango`:

```typescript
  async listarFechasConTurno(organizacionId: string): Promise<Date[]> {
    // DATE_TRUNC('day', ...) agrupa por día en la zona horaria del
    // servidor de PostgreSQL — coherente con TZ=America/Caracas fijado a
    // nivel de proceso Node (ver Task 1 del plan; la columna abiertoEn se
    // guarda en UTC en la base, pero acá truncamos según la sesión de
    // Postgres, que toma su propio timezone — por defecto UTC en la
    // mayoría de los hostings gestionados). Para evitar depender del
    // timezone de la sesión de Postgres, se convierte explícitamente a
    // 'America/Caracas' antes de truncar.
    const filas = await this.prisma.$queryRaw<{ dia: Date }[]>`
      SELECT DISTINCT DATE_TRUNC('day', "abiertoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas') AS dia
      FROM "Turno"
      WHERE "organizacionId" = ${organizacionId}
      ORDER BY dia ASC
    `;
    return filas.map((fila) => fila.dia);
  }
```

- [ ] **Step 3: Crear el caso de uso**

Crear `C:\dev\gym-app\packages\domain\use-cases\ObtenerDiasConActividad.ts`:

```typescript
import { ITurnoRepository } from "../ports/ITurnoRepository";

export async function obtenerDiasConActividad(
  deps: { turnos: ITurnoRepository },
  organizacionId: string
): Promise<Date[]> {
  return deps.turnos.listarFechasConTurno(organizacionId);
}
```

- [ ] **Step 4: Verificar con un script desechable contra la DB real**

Creá `C:\dev\gym-app\packages\db\check-temp.ts`:

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaTurnoRepository } from "../infrastructure/persistence/prisma/PrismaTurnoRepository";
import { obtenerDiasConActividad } from "../domain/use-cases/ObtenerDiasConActividad";

const prisma = new PrismaClient();

async function main() {
  const turno = await prisma.turno.findFirst();
  if (!turno) throw new Error("No hay ningún turno en la base — no se puede verificar.");

  const dias = await obtenerDiasConActividad({ turnos: new PrismaTurnoRepository(prisma) }, turno.organizacionId);

  console.log(`Días con actividad encontrados: ${dias.length}`);
  console.log(dias.slice(0, 5).map((d) => d.toISOString()));

  if (dias.length === 0) {
    throw new Error("FALLÓ: debería haber al menos un día con actividad, ya que existe al menos un turno.");
  }
  console.log("OK: se encontraron días con actividad.");
}

main().finally(() => prisma.$disconnect());
```

Ejecutá:

```bash
cd /c/dev/gym-app/packages/db
npx tsx check-temp.ts
```

Expected: imprime `OK: se encontraron días con actividad.` sin error.

- [ ] **Step 5: Borrar el script desechable**

```bash
cd /c/dev/gym-app/packages/db
rm check-temp.ts
```

- [ ] **Step 6: Build de verificación**

```bash
cd /c/dev/gym-app
npx tsc --noEmit -p apps/web-admin/tsconfig.json
```

Expected: sin errores (confirma que `PrismaTurnoRepository` sigue implementando correctamente `ITurnoRepository` con el método nuevo).

- [ ] **Step 7: Commit**

```bash
cd /c/dev/gym-app
git add packages/domain/ports/ITurnoRepository.ts packages/infrastructure/persistence/prisma/PrismaTurnoRepository.ts packages/domain/use-cases/ObtenerDiasConActividad.ts
git commit -m "feat: agrega listarFechasConTurno y el caso de uso obtenerDiasConActividad"
```

---

## Task 6: Reordenar "Caja" en el menú (debajo de Miembros)

**Files:**
- Modify: `apps/web-admin/app/(panel)/layout.tsx` (array de `items` del `Sidebar`, ya modificado en Task 3 para agregar `<RelojYTasa />` — este es un cambio independiente dentro del mismo archivo)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Reordenar el array de items**

Abrí `C:\dev\gym-app\apps\web-admin\app\(panel)\layout.tsx`. Después de la Task 3, el array de `items` del `Sidebar` es:

```tsx
            items={[
              { href: "/miembros", label: "Miembros" },
              { href: "/pagos", label: "Pagos" },
              { href: "/caja", label: "Caja" },
              { href: "/estadisticas", label: "Estadísticas" },
              // Planes, Sucursales y Usuarios se administran desde las tabs
              // de Configuraciones (ver diseño acordado) — solo SOCIO llega
              // a ellas desde ahí.
              ...(usuario.rol === "SOCIO" ? [{ href: "/configuraciones", label: "Configuraciones" }] : []),
            ]}
```

Reemplazalo por (Caja pasa a la segunda posición, y el label de Pagos cambia a "Histórico de Pagos" — ver Task 8 para el resto de ese renombrado, que incluye el `PageHeader` de la propia página):

```tsx
            items={[
              { href: "/miembros", label: "Miembros" },
              { href: "/caja", label: "Caja" },
              { href: "/pagos", label: "Histórico de Pagos" },
              { href: "/estadisticas", label: "Estadísticas" },
              // Planes, Sucursales y Usuarios se administran desde las tabs
              // de Configuraciones (ver diseño acordado) — solo SOCIO llega
              // a ellas desde ahí.
              ...(usuario.rol === "SOCIO" ? [{ href: "/configuraciones", label: "Configuraciones" }] : []),
            ]}
```

- [ ] **Step 2: Build de verificación**

```bash
cd /c/dev/gym-app
npx tsc --noEmit -p apps/web-admin/tsconfig.json
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /c/dev/gym-app
git add "apps/web-admin/app/(panel)/layout.tsx"
git commit -m "feat: mueve Caja debajo de Miembros en el menu y renombra Pagos a Historico de Pagos"
```

---

## Task 7: Componente `SelectorRangoFechas` (calendario en español, días sin actividad deshabilitados)

**Files:**
- Modify: `packages/ui/package.json` (nueva dependencia)
- Create: `packages/ui/components/SelectorRangoFechas.tsx`

**Interfaces:**
- Consumes: `react-day-picker@10.0.1` (`DayPicker`, `DateRange`, `es` locale desde `react-day-picker/locale`), `inicioDelDia`/`finDelDia`/`inicioDeSemana`/`finDeSemana`/`inicioDeMes`/`finDeMes` (`apps/web-admin/app/(panel)/fechas.ts`).
- Produces: `SelectorRangoFechas` — props `{ desde: Date; hasta: Date; diasConActividad: Date[]; onCambiar: (desde: Date, hasta: Date) => void }` — usado por Task 8 (`pagos/page.tsx`, vía un wrapper cliente que maneja la URL).

- [ ] **Step 1: Instalar `react-day-picker`**

```bash
cd /c/dev/gym-app
npm install react-day-picker@10.0.1 --workspace packages/ui --legacy-peer-deps
```

(Se usa `--legacy-peer-deps` porque este monorepo ya tiene un conflicto preexistente de peer deps entre `react`/`react-dom` — ver el commit `feat: agrega feedback visual (Lottie)...` donde se instaló `lottie-react` con la misma bandera por el mismo motivo. No es específico de `react-day-picker`.)

- [ ] **Step 2: Verificar que se instaló**

```bash
cd /c/dev/gym-app
grep "react-day-picker" packages/ui/package.json
```

Expected: imprime una línea con `"react-day-picker": "10.0.1"` (o el rango que npm haya escrito, ej. `"^10.0.1"`).

- [ ] **Step 3: Crear el componente**

Crear `C:\dev\gym-app\packages\ui\components\SelectorRangoFechas.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { Button } from "./Button";

// OJO: nunca usar fecha.toISOString() para comparar días — convierte a
// UTC primero, y de noche (pasadas las 8pm en Venezuela, UTC-4) eso salta
// al día siguiente. Se compara con los componentes locales de la fecha.
function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

function inicioDeSemana(fecha: Date): Date {
  const d = inicioDelDia(fecha);
  const dia = d.getDay();
  const diff = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function finDeSemana(fecha: Date): Date {
  const d = inicioDeSemana(fecha);
  d.setDate(d.getDate() + 6);
  return finDelDia(d);
}

function inicioDeMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finDeMes(fecha: Date): Date {
  return finDelDia(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
}

export interface SelectorRangoFechasProps {
  desde: Date;
  hasta: Date;
  // Días en que hubo al menos un turno — cualquier otro día queda
  // deshabilitado en el calendario (ver Task 5, obtenerDiasConActividad).
  diasConActividad: Date[];
  onCambiar: (desde: Date, hasta: Date) => void;
}

export function SelectorRangoFechas({ desde, hasta, diasConActividad, onCambiar }: SelectorRangoFechasProps) {
  const [abierto, setAbierto] = useState(false);

  const rango: DateRange = { from: desde, to: hasta };

  function estaDeshabilitado(fecha: Date): boolean {
    return !diasConActividad.some((dia) => mismoDia(dia, fecha));
  }

  function manejarSeleccion(nuevoRango: DateRange | undefined) {
    if (!nuevoRango?.from) return;
    const nuevoDesde = inicioDelDia(nuevoRango.from);
    const nuevoHasta = nuevoRango.to ? finDelDia(nuevoRango.to) : finDelDia(nuevoRango.from);
    onCambiar(nuevoDesde, nuevoHasta);
  }

  function aplicarAtajo(nuevoDesde: Date, nuevoHasta: Date) {
    onCambiar(nuevoDesde, nuevoHasta);
    setAbierto(false);
  }

  const hoy = new Date();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secundario" onClick={() => aplicarAtajo(inicioDelDia(hoy), finDelDia(hoy))}>
        Hoy
      </Button>
      <Button
        type="button"
        variant="secundario"
        onClick={() => aplicarAtajo(inicioDeSemana(hoy), finDeSemana(hoy))}
      >
        Esta semana
      </Button>
      <Button type="button" variant="secundario" onClick={() => aplicarAtajo(inicioDeMes(hoy), finDeMes(hoy))}>
        Este mes
      </Button>

      <div className="relative">
        <Button type="button" variant="secundario" onClick={() => setAbierto((v) => !v)}>
          {desde.toLocaleDateString("es-VE")} — {hasta.toLocaleDateString("es-VE")}
        </Button>

        {abierto && (
          <div
            className="absolute z-50 mt-2 rounded-2xl border p-3 shadow-lg"
            style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}
          >
            <DayPicker
              mode="range"
              locale={es}
              selected={rango}
              onSelect={manejarSeleccion}
              disabled={estaDeshabilitado}
              defaultMonth={hasta}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build de verificación**

```bash
cd /c/dev/gym-app
npx tsc --noEmit -p apps/web-admin/tsconfig.json
```

Expected: sin errores. Si aparece un error de tipos sobre `react-day-picker/locale` o `react-day-picker/style.css` no encontrados, confirmá que el Step 1 instaló la versión exacta `10.0.1` (versiones anteriores tienen una API distinta, sin ese paquete de locales separado).

- [ ] **Step 5: Commit**

```bash
cd /c/dev/gym-app
git add packages/ui/package.json package-lock.json "packages/ui/components/SelectorRangoFechas.tsx"
git commit -m "feat: agrega SelectorRangoFechas (calendario en espanol, dias sin actividad deshabilitados)"
```

---

## Task 8: Migrar el reporte histórico a `/pagos` (Histórico de Pagos)

**Files:**
- Modify: `apps/web-admin/app/(panel)/pagos/page.tsx` (reemplazo completo del archivo)
- Create: `apps/web-admin/app/(panel)/pagos/FiltroFechasHistorico.tsx`

**Interfaces:**
- Consumes: `obtenerReporteCaja` (`packages/domain/use-cases/ObtenerReporteCaja.ts` — sin cambios, ya acepta `{ organizacionId, desde, hasta }`), `obtenerDiasConActividad` (Task 5), `SelectorRangoFechas` (Task 7), `formatearBs` (`apps/web-admin/app/(panel)/tasaBcvFija.ts`), `inicioDelDia`/`finDelDia` (`apps/web-admin/app/(panel)/fechas.ts`).
- Produces: nada que otra tarea consuma — es la última tarea funcional del plan.

- [ ] **Step 1: Crear el wrapper cliente que sincroniza el rango con la URL**

`SelectorRangoFechas` (Task 7) es un componente controlado sin conocimiento de `next/navigation` — este wrapper lo conecta a los query params `?desde=&hasta=` de la URL actual.

Crear `C:\dev\gym-app\apps\web-admin\app\(panel)\pagos\FiltroFechasHistorico.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SelectorRangoFechas } from "@gym-app/ui/components/SelectorRangoFechas";

// OJO: nunca usar fecha.toISOString() acá — convierte a UTC primero, y de
// noche (pasadas las 8pm en Venezuela, UTC-4) eso salta al día siguiente.
function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function FiltroFechasHistorico({
  desde,
  hasta,
  diasConActividadISO,
}: {
  desde: Date;
  hasta: Date;
  // Se pasan como strings ISO (serializable de Server a Client Component)
  // y se reconstruyen a Date acá.
  diasConActividadISO: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const diasConActividad = diasConActividadISO.map((iso) => new Date(iso));

  function manejarCambio(nuevoDesde: Date, nuevoHasta: Date) {
    const params = new URLSearchParams(searchParams);
    params.set("desde", formatearFechaISO(nuevoDesde));
    params.set("hasta", formatearFechaISO(nuevoHasta));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <SelectorRangoFechas desde={desde} hasta={hasta} diasConActividad={diasConActividad} onCambiar={manejarCambio} />
  );
}
```

- [ ] **Step 2: Reemplazar `pagos/page.tsx` completo**

El archivo actual (109 líneas, listado plano de pagos) se reemplaza íntegramente. Escribí `C:\dev\gym-app\apps\web-admin\app\(panel)\pagos\page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { obtenerDiasConActividad } from "@gym-app/domain/use-cases/ObtenerDiasConActividad";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { formatearBs } from "../tasaBcvFija";
import { inicioDelDia, finDelDia } from "../fechas";
import { FiltroFechasHistorico } from "./FiltroFechasHistorico";

// El método se guarda como snapshot legible ("Pago Móvil - Banesco")
// directo en Pago.metodo — no hay catálogo estático que traducir.
function nombreMetodo(valor: string): string {
  return valor;
}

export default async function PaginaHistoricoPagos({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { desde: desdeTexto, hasta: hastaTexto } = await searchParams;
  const hoy = new Date();
  const desde = desdeTexto ? inicioDelDia(new Date(`${desdeTexto}T00:00:00`)) : inicioDelDia(hoy);
  const hasta = hastaTexto ? finDelDia(new Date(`${hastaTexto}T00:00:00`)) : finDelDia(hoy);

  const turnoRepo = new PrismaTurnoRepository(prisma);

  const [reporte, diasConActividad] = await Promise.all([
    obtenerReporteCaja(
      {
        turnos: turnoRepo,
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
        arqueo: new PrismaArqueoRepository(prisma),
      },
      { organizacionId: usuario.organizacionId, desde, hasta }
    ),
    obtenerDiasConActividad({ turnos: turnoRepo }, usuario.organizacionId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <PageHeader>Histórico de Pagos</PageHeader>

      <FiltroFechasHistorico
        desde={desde}
        hasta={hasta}
        diasConActividadISO={diasConActividad.map((d) => d.toISOString())}
      />

      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--gx-muted)" }}>
        <span className="ml-auto text-base font-semibold" style={{ color: "var(--gx-ink)" }}>
          Total: ${reporte.totalUSD.toFixed(2)}
        </span>
      </div>

      {reporte.turnos.map((fila) => (
        <Card key={fila.turno.id} className="text-sm">
          <div className="mb-2 flex justify-between font-medium" style={{ color: "var(--gx-ink)" }}>
            <span>Turno {fila.turno.abiertoEn.toLocaleString("es-VE")}</span>
            <span>Neto: ${fila.netoUSD.toFixed(2)}</span>
          </div>
          <div className="mb-2 flex justify-between" style={{ color: "var(--gx-muted)" }}>
            <span>Cobrado: ${fila.totalPagosUSD.toFixed(2)}</span>
            {fila.totalEgresosUSD > 0 && <span>Egresos (USD): -${fila.totalEgresosUSD.toFixed(2)}</span>}
          </div>
          {fila.pagos.filter((p) => !p.anuladoEn).length > 0 && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead>
                    <tr style={{ color: "var(--gx-muted)" }}>
                      <th className="py-1">Miembro</th>
                      <th className="py-1">Método</th>
                      <th className="py-1">USD</th>
                      <th className="py-1">Tasa</th>
                      <th className="py-1">Bs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.pagos
                      .filter((p) => !p.anuladoEn)
                      .map((pago) => (
                        <tr key={pago.id}>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {pago.miembroNombre ?? pago.miembroId}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {nombreMetodo(pago.metodo)}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            ${pago.monto.toFixed(2)}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {pago.tasaCambio !== null ? pago.tasaCambio.toFixed(2) : "—"}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {pago.montoBs !== null ? `Bs. ${formatearBs(pago.montoBs)}` : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {fila.egresos.length > 0 && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2" style={{ borderColor: "var(--gx-edge)" }}>
              {fila.egresos.map((egreso) => (
                <div key={egreso.id} className="flex justify-between" style={{ color: "var(--gx-muted)" }}>
                  <span>{egreso.motivo}</span>
                  <span>
                    -{egreso.monto.toFixed(2)} {egreso.moneda}
                  </span>
                </div>
              ))}
            </div>
          )}
          {fila.arqueo.map((linea) => (
            <div key={linea.metodo} className="flex justify-between" style={{ color: "var(--gx-muted)" }}>
              <span>{nombreMetodo(linea.metodo)}</span>
              <span>
                {linea.montoContado.toFixed(2)} contado ({linea.diferencia === 0 ? "sin diferencia" : `dif. ${linea.diferencia.toFixed(2)}`})
              </span>
            </div>
          ))}
        </Card>
      ))}

      {reporte.ajustesFueraDeTurno.length > 0 && (
        <div
          className="rounded-2xl border p-5 text-sm"
          style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}
        >
          <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-warn)" }}>
            Ajustes fuera de turno
          </h2>
          {reporte.ajustesFueraDeTurno.map((pago) => (
            <div
              key={pago.id}
              className="flex justify-between border-b py-2"
              style={{ borderColor: "color-mix(in srgb, var(--gx-warn) 30%, transparent)" }}
            >
              <span style={{ color: "var(--gx-ink)" }}>
                {pago.miembroNombre ?? pago.miembroId} — {nombreMetodo(pago.metodo)}
              </span>
              <span className="flex gap-3" style={{ color: "var(--gx-ink)" }}>
                <span>${pago.monto.toFixed(2)}</span>
                <span>{pago.tasaCambio !== null ? `Tasa ${pago.tasaCambio.toFixed(2)}` : "—"}</span>
                <span>{pago.montoBs !== null ? `Bs. ${formatearBs(pago.montoBs)}` : "—"}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {reporte.turnos.length === 0 && reporte.ajustesFueraDeTurno.length === 0 && (
        <p style={{ color: "var(--gx-muted)" }}>Sin turnos en este período.</p>
      )}
    </div>
  );
}
```

Nota sobre `pagos/nuevo/page.tsx`: esa ruta (formulario para registrar un pago suelto, fuera de un turno) no cambia en esta tarea — sigue existiendo y sigue siendo enlazable, simplemente esta página ya no la enlaza como "Registrar pago" en el header (el botón que había ahí se quita porque el listado plano que lo mostraba desaparece). Si en el futuro se quiere un acceso directo a `/pagos/nuevo` desde Histórico de Pagos, es una decisión de diseño aparte, fuera de este plan.

- [ ] **Step 3: Build de verificación**

```bash
cd /c/dev/gym-app
npx tsc --noEmit -p apps/web-admin/tsconfig.json
```

Expected: sin errores.

- [ ] **Step 4: Build completo de `web-admin`**

```bash
cd /c/dev/gym-app
npm run build --workspace apps/web-admin
```

Expected: `exit code 0`, sin errores de compilación. Este comando puede tardar varios minutos — si tu terminal tiene un timeout corto, ejecutalo en background y esperá la notificación de finalización antes de continuar.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/gym-app
git add "apps/web-admin/app/(panel)/pagos/page.tsx" "apps/web-admin/app/(panel)/pagos/FiltroFechasHistorico.tsx"
git commit -m "feat: Historico de Pagos reemplaza el listado plano por el reporte de turnos con calendario de rango"
```

---

## Task 9: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

**Interfaces:**
- Consumes: todo lo construido en las Tareas 1-8.
- Produces: nada.

- [ ] **Step 1: Verificar el reordenamiento del menú**

Arrancá el servidor de desarrollo (`npm run dev --workspace apps/web-admin` o el comando que uses habitualmente) y entrá al panel con un usuario cualquiera. Confirmá visualmente que el sidebar (desktop) muestra el orden: Miembros, Caja, Histórico de Pagos, Estadísticas, [Configuraciones si es SOCIO].

- [ ] **Step 2: Verificar el reloj + tasa**

En cualquier pantalla del panel, confirmá que aparece en la esquina superior derecha un bloque con la fecha/hora actual (actualizándose cada segundo) y, si hay una tasa BCV guardada en la base, la tasa al lado.

- [ ] **Step 3: Verificar el bug de sucursal corregido**

Iniciá sesión como un usuario `SOCIO` de una organización con más de una sucursal. Andá a `/caja` (sin turno abierto en ninguna sucursal) y confirmá que el formulario "Abrir turno" muestra un selector de sucursal con las sucursales reales de la organización (no vacío). Elegí una, completá los fondos iniciales, y confirmá que el turno se abre sin error.

- [ ] **Step 4: Verificar que no hay botón imprimir en Abrir Turno**

Con el turno recién abierto del Step 3, cerralo (usá el arqueo con los montos que corresponda). Volvé a `/caja` (sin turno abierto de nuevo) y confirmá que la pantalla de "Abrir turno" no muestra ningún botón "Imprimir".

- [ ] **Step 5: Verificar Histórico de Pagos**

Andá a `/pagos`. Confirmá:
- El header dice "Histórico de Pagos" (no "Pagos").
- Aparece el turno que abriste y cerraste en los Steps 3-4 (si el rango por defecto es "hoy" y lo hiciste hoy).
- Los atajos "Hoy" / "Esta semana" / "Este mes" cambian el rango mostrado al hacer click.
- Al abrir el calendario, los textos están en español (nombres de mes y día de la semana).
- Si abrís el calendario y navegás a un mes sin ningún turno registrado en esa organización, todos los días de ese mes aparecen deshabilitados (no clickeables).

- [ ] **Step 6: Verificar la persistencia del rango en la URL**

Con un rango distinto de "hoy" seleccionado en Histórico de Pagos (por ejemplo "Esta semana"), confirmá que la URL del navegador cambió a algo como `/pagos?desde=2026-09-14&hasta=2026-09-20`. Recargá la página (F5) y confirmá que el rango seleccionado se mantiene (no vuelve a "hoy").

Si algún paso de esta verificación falla, volvé a la tarea correspondiente (Task 2 para el bug de sucursal, Task 3 para el reloj, Task 4 para el botón imprimir, Tasks 5/7/8 para el calendario/histórico) y revisá el código antes de continuar.
