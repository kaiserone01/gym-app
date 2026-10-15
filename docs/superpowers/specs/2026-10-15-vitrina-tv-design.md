# Vitrina-AdrenalinaXtremeGYM: diseño

## Objetivo
Convertir una TV Android del gimnasio (horizontal) en una vitrina que presenta al staff de entrenadores (foto o video vertical), exhibe carteles de promos y exhibe productos con precio, oferta y descuento. Todo se controla desde el web-admin. Se compila como APK por GitHub Action, como el kiosco, con el escudo de la marca como ícono. Identidad: negro, verde lima (`#93e83a`) y blanco (tokens `--gx-*` en `packages/theming/tokens.ts`).

## Decisiones
- Dispositivo: Android TV o TV box, horizontal, una sola TV.
- Carteles de promos y productos: se suben ya diseñados (imagen o video), con fecha de inicio y fin.
- Productos: independientes del catálogo `Producto` de Caja (sin enlace ni sincronización). Solo exhibición, sin carrito ni cobro.
- Badges editables sobre el diseño (precio, oferta, descuento, etiqueta), cada uno activable o desactivable.
- Entrenadores: medio vertical, nombre, especialidad y frase, cada campo activable. Se muestran en franjas verticales de 3 o 4 lado a lado.
- Enfoque: app propia `apps/vitrina` con APK propio y workflow propio.

## Fuera de alcance (v1)
Más de una TV o sede, sonido, interacción, datos de miembros, promos en media pantalla, franja inferior, promos urgentes o por hora, vista previa, estado de la TV, deshacer.

## 1. Datos y API
- Migración nueva en `packages/db/prisma/migrations/` (nombre en español):
  - `VitrinaItem` (ligado a `Sucursal`): `tipo` (ENTRENADOR/PROMO/PRODUCTO), `orden`, `activo`, `duracionSeg`, `inicio?`, `fin?`, `mediaUrl`, `mediaTipo` (IMAGEN/VIDEO), `posterUrl?`.
  - Badges (nulos si no aplican): `precioUSD?`, `ofertaUSD?`, `descuentoPct?`, `etiqueta?` y banderas `mostrarPrecio/Oferta/Descuento/Etiqueta/EquivalenteBs`. El descuento es manual o calculado de precio y oferta. El equivalente en Bs se calcula en la TV con `tasaBcv`. La TV dibuja los badges con la marca (precio normal tachado, oferta en verde lima); no van incrustados en la imagen.
  - `VitrinaEntrenador`: `usuarioId` (`UsuarioAdmin` con rol ENTRENADOR), `especialidad?`, `frase?`, `mediaUrl?`, `mediaTipo`, banderas `mostrarMedio/Nombre/Especialidad/Frase`. El nombre sale de `UsuarioAdmin`; si se desactiva, desaparece de la vitrina.
  - En `Sucursal`: duración por defecto del cartel y estilo de transición.
- Dominio puro con tests en `packages/domain`: dada la hora actual, devuelve lo que se muestra (activo, dentro de `inicio`/`fin`, ordenado, entrenadores agrupados en franjas de 3-4). Ampliar `EntrenadorResumen` o crear entidad propia.
- API `GET /api/kiosco/vitrina` (`apps/web-admin/app/api/kiosco/vitrina/route.ts`), mismo patrón que `api/kiosco/estado/route.ts`: `OPTIONS` + `GET`, `sucursalDeKiosco` y `jsonKiosco` de `apps/web-admin/lib/kiosco.ts`. Devuelve lista resuelta, `tasaBcv` y número de versión.
- Medios en R2, carpeta `vitrina/`. Imágenes con el patrón de `guardarImagen` (`app/(panel)/kiosko/actions.ts`; validación en `packages/domain/utils/imagenSubida.ts`). Videos: validador mp4/webm con tope propio y subida por route handler, porque el límite de server actions es 10 MB (`apps/web-admin/next.config.ts`). Extender `IArchivoStorageService` solo si hace falta `eliminar`. Verificar si el proxy del hosting limita el body.

## 2. Dashboard (web-admin)
- Módulo `apps/web-admin/app/(panel)/vitrina/` copiando la estructura de `kiosko/`: pestañas Entrenadores, Promos, Productos y Ajustes (duración, transición). Promos y Productos comparten `FormularioCartel` con interruptores por badge.
- Permiso igual que Kiosko (`apps/web-admin/lib/permisoKiosko.ts`: SOCIO o GERENTE).
- Menú: `Sidebar` en `apps/web-admin/app/(panel)/layout.tsx`, `MasSheet.tsx` y `NavegacionMobile.tsx`.
- UI con `packages/ui`.

## 3. App de TV (`apps/vitrina`)
- Next con `output: "export"`, como `apps/kiosk`. Clave de sede por fragmento `#clave=`, reutilizando la lógica de `apps/kiosk/lib/claveFragmento.ts` y `config.ts` (moverla a un paquete compartido si procede, sin duplicarla).
- Pantalla completa para promos y productos; franjas verticales para entrenadores; videos mudos en bucle; pocas transiciones al inicio.
- Escala con `rem`/`clamp` como el kiosco (16 px a 1920x1080).
- Offline: último contenido en `localStorage` y medios en Cache API o service worker (el `sw.js` del kiosco no cachea videos). Refresco cada ~30 s por versión, como `useInfoKiosco`. Nunca pantalla en negro.

## 4. APK y GitHub Action
- Parametrizar `apps/kiosk-tv/capacitor` (`preparar.mjs`, `url.mjs`, plantilla Android) para reutilizarlo con otro `appId`, nombre, URL e ícono. Alternativa si es muy invasivo: `apps/vitrina-tv` con scripts compartidos.
- `.github/workflows/apk-vitrina.yml`, adaptado de `apk-kiosco.yml`: `workflow_dispatch`, input `sucursal`, secreto `VITRINA_CLAVE_<sucursal>`, `assembleDebug`, 7z cifrado con `KIOSCO_APK_PASSWORD`, artefacto con retención de 7 días.
- Ícono: el escudo adjunto en los mipmap de Android y en `icon.png` y manifest de `apps/vitrina`.
- Arranque automático: el kiosco no lo tiene (límite de Android 10+). Evaluar `RECEIVE_BOOT_COMPLETED` y `LEANBACK_LAUNCHER`; documentar la limitación.
- Dockerfile estático análogo a `apps/kiosk/Dockerfile` (`NEXT_PUBLIC_API_URL` como ARG) y URL pública propia.

## Orden de construcción
1. Migración y dominio con tests.
2. API `/api/kiosco/vitrina` y subida de medios.
3. Módulo del dashboard.
4. App `apps/vitrina` con reproductor y offline.
5. APK, workflow, ícono y Dockerfile.

## Verificación
- `npm test --workspace packages/domain` (fechas, orden, franjas).
- `npm run build` y `npm run lint` en web-admin y vitrina.
- API con y sin clave; cargar un entrenador, una promo y un producto desde el dashboard; ver la vitrina a 1920x1080 y sin red.
- Disparar el workflow y comprobar el artefacto cifrado; instalar el APK en un Android TV (offline, ícono, arranque).
- No correr `prisma migrate` contra el `.env` local (es producción); la migración se aplica en el deploy.

## Valores por defecto (editables en Ajustes)
Duración por cartel, y las preguntas abiertas que no cambian el diseño: contacto o precio en las promos y métricas.
