# Kiosko: ficha en reposo configurable desde el panel — diseño

Fecha: 2026-10-08. Estado: pendiente de revisión del usuario.

## Objetivo
Que SOCIO y GERENTE cambien desde el panel lo que muestra la **ficha en reposo** del kiosco —frases rotativas, imagen del círculo y transparencia del fondo de la ficha (para dejar ver las ondas del video)— y que el TV lo refleje solo, sin recompilar ni recargar la APK.

## Criterios de éxito
- Un cambio guardado en el panel aparece en el kiosco en ≤ ~30 s sin recargar.
- Sin red, el kiosco conserva la última configuración recibida.
- Sin configurar nada, el reposo se ve exactamente como hoy.
- Un kiosco viejo (sin soporte) no se rompe con el API nuevo.

## Decisiones del usuario
1. Ítem de menú **"Kiosko"** entre **Miembros** y **Configuraciones** (sidebar de escritorio y navegación móvil).
2. Tab **Frases**: lista editable, agregar y quitar tantas líneas como se quiera.
3. Tab **Imagen**: foto de perfil de la ficha en espera + control de opacidad del fondo de la ficha en reposo.
4. Configuración **por sucursal** (la sucursal activa del panel).
5. Permisos: **SOCIO y GERENTE**.
6. Actualización por **consulta cada ~30 s** (sin WebSocket).
7. Imagen subida a R2 con el **mismo ajuste de zoom/encuadre circular** de las fotos de miembros; respaldo `placeholder-profile.jpg`.

## Supuestos (no confirmados por el usuario)
- La opacidad afecta solo al **fondo** de la ficha en reposo, no al texto, logo ni imagen, ni a las fichas de miembro o rechazo.
- Lista de frases vacía ⇒ se usan las 10 frases por defecto de `apps/kiosk/lib/frases.ts`.
- Opacidad mínima permitida: **20 %** (por contraste del texto sobre las ondas).

## Datos (`packages/db/prisma/schema.prisma`, modelo `Sucursal`)
- `reposoFrases String[] @default([])`
- `reposoImagenUrl String?` (null ⇒ placeholder)
- `reposoOpacidad Int @default(100)` (20–100)
- Migración aditiva con defaults, nombre en español (`20261008100000_sucursal_reposo_kiosko`). No altera datos existentes; se aplica sola al arrancar el contenedor. Respaldar la BD antes, como en la migración de género.

## Dominio (`packages/domain`)
Funciones puras con tests Vitest co-ubicados:
- `normalizarFrasesReposo(entrada: string[]): string[]`: recorta espacios, descarta vacías y duplicadas, máx. 60 caracteres por frase y 30 frases.
- `limitarOpacidad(n: unknown): number`: entero entre 20 y 100; 100 si el valor no es válido.
Se usan al guardar (servidor) y en el API de lectura.

## Panel (`apps/web-admin`)
- **Menú:** `app/(panel)/layout.tsx` agrega `/kiosko` entre Miembros y Configuraciones si el rol es SOCIO o GERENTE; mismo ítem en `NavegacionMobile.tsx` / `MasSheet.tsx`.
- **Rutas:** `app/(panel)/kiosko/{layout,page,actions}.ts(x)`, `kiosko/frases/page.tsx`, `kiosko/imagen/page.tsx`. El layout valida el rol (redirige a `/miembros`), muestra `PageHeader` "Kiosko" y reutiliza `TabsConfiguraciones` con una lista `TABS_KIOSKO`. `/kiosko` redirige a `/kiosko/frases`.
- **Frases:** inputs con "Agregar frase" y "Quitar"; aviso "Sin frases: se usarán las predeterminadas".
- **Imagen:** reutiliza `SelectorFotoPerfil` (subir, cámara, ajustar encuadre); sube a R2 con `storageR2().subir("kiosko", …)`; botón "Restablecer imagen original". Deslizador de opacidad (20–100 %) con vista previa en vivo sobre un fondo de ondas.
- **Actions:** validan rol SOCIO/GERENTE en el servidor, operan siempre sobre `sucursalActivaId` de la sesión verificando que pertenezca a la organización del usuario.

## API (`apps/web-admin/app/api/kiosco/estado/route.ts`)
`GET /api/kiosco/estado` agrega un campo opcional `reposo: { frases: string[]; imagenUrl: string | null; opacidad: number }`. Compatible hacia atrás. La imagen se sirve directo desde `R2_PUBLIC_URL`.

## Kiosco (`apps/kiosk`)
- `lib/api.ts`: tipo `InfoKiosco.reposo?`.
- `lib/useInfoKiosco.ts`: `REFRESCO_MS` de 10 min a 30 s. Ya guarda en localStorage.
- `app/page.tsx` + `useFraseRotativa`: usa `reposo.frases` si no está vacío, si no `FRASES_REPOSO`. El arreglo se memoiza **por contenido** para que el sondeo cada 30 s no reinicie la rotación si nada cambió.
- `components/FichaReposo.tsx`: imagen = `reposo.imagenUrl ?? placeholder`; el `scale-[1.25]` solo aplica al placeholder; pasa la opacidad a `MarcoFicha`.
- `components/MarcoFicha.tsx`: prop opcional `opacidadFondo` (por defecto 100). Fondo con `rgba(var(--gx-surface-rgb), α)`, **sin `color-mix()`** (WebView viejo). Definir `--gx-surface-rgb` en `globals.css`. Solo `FichaReposo` la usa.

## Riesgos
- Contraste con opacidad baja: mínimo 20 % y vista previa.
- R2: carpeta `kiosko/`; la imagen anterior no se borra automáticamente (igual que las fotos de miembros).
- Primer arranque sin red: placeholder, frases por defecto y opacidad 100.
- Despliegue: web-admin (migración + API + UI) **y** apps/kiosk; la APK no se recompila.

## Verificación
- Vitest del dominio y de la comparación de frases del kiosco; `tsc`, `lint`, `build` de web-admin y kiosk.
- Manual: frases nuevas visibles en ≤ 30 s; imagen con encuadre; opacidad con ondas visibles; GERENTE entra, RECEPCION no (ni por URL); kiosco sin red y con API vieja.
