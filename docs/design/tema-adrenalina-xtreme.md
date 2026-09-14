# Spec de diseño — Tema "Adrenalina Xtreme"

> Spec de diseño para `docs/superpowers/plans/2026-09-14-tema-adrenalina-xtreme.md`. Documenta los tokens y componentes antes de tocar código, siguiendo la metodología de sistema de diseño: tokens primero, componentes después, páginas al final.

## Contexto

El panel admin y el kiosco usaban colores genéricos (grises de `create-next-app` en el login; texto plano en el resultado del check-in del kiosco). El usuario aprobó, después de iterar sobre 4 mockups (`docs/superpowers/plans/...` — exploración visual, no versionada como plan), la dirección **"B — Círculo + halo suave"** para el login, y el layout de "ficha de acceso" (avatar + banner de estado + datos) para el resultado del check-in.

Este documento fija los tokens reales (no los del mockup, que eran una aproximación) y el inventario de componentes antes de escribir el plan de tareas.

## Decisión de alcance (de esta sesión)

- **Tema fijo, no dinámico por Organización todavía.** El ADR define `packages/theming` como un motor que resuelve `TemaOrganizacion` desde la base de datos por Organización — esa pieza completa (caso de uso, puerto, endpoint para que el kiosco sin sesión también pueda pedir el tema) queda para un plan aparte. Hoy `packages/theming` exporta un solo tema hardcodeado, reutilizable por cualquier app del monorepo, pero no hay resolución por Organización.
- **La ficha de acceso NO incluye "Miembro desde"/"Vence"** — `POST /api/checkin` no devuelve esos campos hoy y extenderlo queda fuera de este plan. La ficha muestra solo lo que el endpoint ya entrega: nombre, hora de entrada, entrenador, estado.
- **El logo usa el archivo ya subido** (`apps/web-admin/public/branding/logo-adrenalina-gym.jpg`) — no existe todavía ningún flujo de subida de imágenes en el proyecto (la subida de `fotoUrl` de `Miembro` también está diferida, ver Plan 5).

## Tokens de color

Muestreados del logo real (`logo-adrenalina-gym.jpg`, promedio de los verdes más brillantes de la imagen — ver metodología abajo), no inventados:

| Token CSS | Valor | Uso |
|---|---|---|
| `--gx-ground` | `#0a0d07` | Fondo de página — negro con tinte verde cálido, no negro plano |
| `--gx-surface` | `#12160d` | Tarjetas, paneles |
| `--gx-surface-2` | `#191f11` | Elementos anidados (inputs) |
| `--gx-edge` | `#26301a` | Bordes, separadores |
| `--gx-ink` | `#f3f6ec` | Texto principal (blanco roto, no `#fff` puro) |
| `--gx-muted` | `#93a17d` | Texto secundario |
| `--gx-muted-dim` | `#545e42` | Texto terciario, placeholders |
| `--gx-accent` | `#93e83a` | Único acento — botones, foco, aro del avatar, banner "activo" |
| `--gx-accent-ink` | `#0c1400` | Texto sobre fondo `--gx-accent` |
| `--gx-bad` | `#ff3b4e` | Estado "vencido"/error — deliberadamente NO es un verde apagado, para que el "no" se lea inequívoco en una marca que es toda verde |
| `--gx-bad-ink` | `#200609` | Texto sobre fondo `--gx-bad` |

**Metodología de muestreo:** `PIL` sobre `logo-adrenalina-gym.jpg`, redimensionado a 100×100, filtrando píxeles donde `G > 150` y `G > 1.4×R` y `G > 1.4×B` (verdes vívidos, descarta el negro del escudo y el blanco de las siluetas), promediando los 200 más brillantes → `RGB(151, 239, 66)` → ajustado a `#93e83a` para un contraste AA razonable de texto negro encima (`--gx-accent-ink`) y de sí mismo sobre `--gx-ground`.

## Tokens de tipografía

Ya usados en el mockup, se mantienen (Google Fonts, ya en el CSP-allowlist del proyecto):

| Token | Familia | Uso |
|---|---|---|
| `--gx-font-display` | `"Bebas Neue"` | Nombres, títulos grandes, banner de estado |
| `--gx-font-body` | `"Barlow"` | Texto de cuerpo, inputs |
| `--gx-font-label` | `"Barlow Condensed"` | Etiquetas uppercase, botones |

## Dónde viven los tokens (decisión técnica)

`packages/theming` se consume como módulo TypeScript (mismo patrón que `@gym-app/domain`/`@gym-app/ui` — transpilado, no un paquete CSS que Tailwind tenga que resolver vía `@import` entre workspaces). Un componente `<ThemeStyleTag>` renderiza un `<style>` con las variables CSS en `:root` a partir de un objeto `Tema` — así cualquier app puede montarlo donde le convenga.

**Alcance del montaje (importante, evita romper lo ya construido):**
- `apps/kiosk`: `<ThemeStyleTag>` en el layout raíz — toda la app es de esta marca, no hay pantallas en otro tema.
- `apps/web-admin`: `<ThemeStyleTag>` **solo dentro de la página `/login`**, no en el layout raíz — el panel `/miembros` (Plan 9) ya tiene su propio fix de legibilidad en modo claro (`bg-white text-neutral-900`, revisión final del Plan 9) y no se toca en este plan. Como `:root` es global mientras el componente está montado, y Next.js desmonta el árbol de `/login` al navegar a `/miembros`, los tokens no se filtran entre pantallas.

## Componentes nuevos

### `LogoBadge` (`packages/ui/components/LogoBadge.tsx`)
Recorte circular del logo + halo radial tenue detrás (sin animación — la Opción B del mockup explícitamente descartó el radar giratorio por "mucho verde eléctrico"). Props: `src`, `alt`, `size` (default 148px).

### `AccessCard` (`apps/kiosk/components/AccessCard.tsx`)
Reemplaza el texto plano actual del resultado del check-in. Específico del kiosco — no se promueve a `packages/ui` todavía (un solo consumidor; se gradúa si aparece un segundo, mismo criterio ya usado con `domain-custom`). Dos estados:
- **Activo:** banner `--gx-accent`, aro del avatar `--gx-accent`, "✓ Acceso permitido".
- **Vencido:** banner `--gx-bad`, aro del avatar `--gx-bad`, "✕ Membresía vencida".

Datos mostrados (solo los que `/api/checkin` ya entrega): nombre, avatar (foto si `fotoUrl` existe, iniciales si no — mismo fallback que ya se probó en el mockup), hora de entrada (calculada en el cliente al recibir la respuesta, no viaja en el payload), entrenador (`—` si no tiene).

## Fuera de alcance (explícito)

- Tema dinámico por Organización (`TemaOrganizacion`, `ObtenerTemaOrganizacion`, endpoint para el kiosco) — plan aparte.
- "Miembro desde"/"Vence" en la ficha — requiere extender `/api/checkin` primero.
- Migrar `/login` a los componentes `Button`/`Input` de `packages/ui` (siguen siendo inputs propios del formulario existente) — cambio de fontanería sin relación directa con el tema visual, se evalúa aparte.
- Reskinning del panel `/miembros` con este tema — decisión deliberada, no un olvido.
