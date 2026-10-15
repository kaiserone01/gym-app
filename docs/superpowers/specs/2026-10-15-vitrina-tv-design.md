# Vitrina-AdrenalinaXtremeGYM: diseño

## Objetivo
Convertir una TV Android del gimnasio (horizontal) en una vitrina que presenta al staff de entrenadores (foto o video vertical), exhibe carteles de promos y exhibe productos con precio, oferta y descuento. Todo se controla desde el web-admin. Se compila como APK por GitHub Action, como el kiosco, con el escudo de la marca como ícono. Identidad: negro, verde lima (`#93e83a`) y blanco (tokens `--gx-*` en `packages/theming/tokens.ts`).

## Decisiones
- Dispositivo: Android TV oficial (con Google Play Services), horizontal, una sola TV.
- La app web se empaqueta dentro del APK (export estático). No se carga por URL remota, salvo en desarrollo.
- Carteles de promos y productos: se suben ya diseñados (imagen o video), con fecha de inicio y fin.
- Productos: independientes del catálogo `Producto` de Caja (sin enlace ni sincronización). Solo exhibición, sin carrito ni cobro.
- Badges editables sobre el diseño (precio, oferta, descuento, etiqueta), cada uno activable o desactivable.
- Entrenadores: medio vertical, nombre, especialidad y frase, cada campo activable. Se muestran en franjas de exactamente 3 columnas.
- Enfoque: app propia `apps/vitrina` con APK propio y workflow propio.

## Fuera de alcance (v1)
Más de una TV o sede, sonido, interacción, datos de miembros, promos en media pantalla, franja inferior, promos urgentes o por hora, vista previa, estado de la TV, deshacer.

## 1. Datos y API

### Modelo
Una sola tabla de contenido, sin `VitrinaEntrenador`. Migración nueva en `packages/db/prisma/migrations/` (nombre en español).

`VitrinaItem` (ligado a `Sucursal` por `sucursalId`, índice `(sucursalId, orden)`):
- Comunes: `tipo` (ENTRENADOR/PROMO/PRODUCTO), `orden` (entero), `activo` (**por defecto `false`**: todo ítem nuevo nace inactivo hasta que la administración lo activa), `duracionSeg?` (nulo = la de la sede), `inicio?`, `fin?`, `mediaUrl`, `mediaTipo` (IMAGEN/VIDEO), `posterUrl?`, `createdAt`, `updatedAt`.
- Badges (PROMO y PRODUCTO; nulos si no aplican): `precioUSD?`, `ofertaUSD?`, `descuentoPct?`, `etiqueta?` y banderas `mostrarPrecio/Oferta/Descuento/Etiqueta/EquivalenteBs`. El descuento es manual o calculado de precio y oferta. La TV dibuja los badges con la marca (precio normal tachado, oferta en verde lima); no van incrustados en la imagen.
- Entrenador (solo `tipo = ENTRENADOR`): `usuarioId` (`UsuarioAdmin` con rol ENTRENADOR), `especialidad?`, `frase?`, banderas `mostrarMedio/Nombre/Especialidad/Frase`. `@@unique([sucursalId, usuarioId])` (un entrenador aparece una vez por sede; los nulos no chocan). El nombre sale de `UsuarioAdmin`; `mediaUrl` es opcional y, si falta, se usa `UsuarioAdmin.fotoUrl`. Si el usuario se desactiva o pierde la sede, el ítem deja de resolverse. Al crearlo, la server action valida que el usuario sea ENTRENADOR y pertenezca a esa sede (`UsuarioSucursal`).
- Las reglas por tipo (campos obligatorios o prohibidos según `tipo`) se validan en el dominio y en la server action, no con restricciones de BD.

`Sucursal` gana: `vitrinaDuracionSeg` (por defecto 12), `vitrinaTransicion` (estilo; por defecto fundido) y `vitrinaVersion` (entero que se incrementa en la misma transacción de cada cambio de contenido; es el "número de versión" del manifiesto).

### Orden, franjas e intercalado
- `orden` es global por sede: la administración reordena entrenadores, promos y productos en una sola lista (subir/bajar).
- Se resuelve en este orden: se descartan los ítems inactivos, fuera de `inicio`/`fin`, o cuyo entrenador no esté activo en la sede. Después, los entrenadores que quedan **consecutivos** en la lista se agrupan en franjas; un cartel de promo o producto entre dos entrenadores corta el grupo. Así la administración decide cómo se intercalan arrastrando ítems.
- Cada franja tiene como máximo 3 entrenadores. Un grupo de `n` entrenadores se reparte en `ceil(n/3)` franjas lo más parejas posible, con las mayores primero y sin dejar una franja de 1 salvo que `n = 1`: 1→1; 2→2; 3→3; 4→2+2; 5→3+2; 6→3+3; 7→3+2+2; 8→3+3+2.
- Una franja con 1 o 2 entrenadores conserva el ancho de columna de las de 3 y se centra: nunca se estiran las fotos.
- Duración de una franja: la `duracionSeg` de su primer entrenador, o la de la sede.
- Fotos verticales 9:16 en columnas de ~640x1080 (1920/3): el recorte "cover" es de ~5% de la altura. Con 4 columnas (480 px) sería de ~21%, por eso se fija en 3.

### Dominio puro (con tests en `packages/domain`)
Función que, dado el momento actual, la lista de ítems y los entrenadores activos, devuelve la secuencia de diapositivas (carteles y franjas). Cubre fechas, orden, intercalado y los repartos de arriba. Ampliar `EntrenadorResumen` o crear entidad propia.

### API
- `GET /api/kiosco/vitrina` (`apps/web-admin/app/api/kiosco/vitrina/route.ts`), mismo patrón que `api/kiosco/estado/route.ts`: `OPTIONS` + `GET`, `sucursalDeKiosco` y `jsonKiosco` de `apps/web-admin/lib/kiosco.ts`. Devuelve los ítems (aún sin filtrar por fecha, para que la TV pueda evaluar `inicio`/`fin` sin red), `vitrinaVersion`, `tasaBcv` y `tasaActualizadaEn` (el `createdAt` de la fila vigente de `TasaCambio`; su `fecha` es solo el día).
- `GET /api/kiosco/vitrina/eventos`: flujo SSE que avisa a la TV de cada cambio hecho en el dashboard (sección 3). `dynamic = "force-dynamic"` y sin buffering.
- Equivalente en Bs: la TV lo muestra solo si `ahora - tasaActualizadaEn <= 72 h`; pasado ese umbral lo oculta (el precio en USD sigue). El umbral (72 h para cubrir un fin de semana, ajustable) es una constante en `packages/domain`. Se evalúa con el reloj de la TV, también sin red.

### Medios en R2
Todas las piezas (fotos y videos de entrenadores, carteles de promos y productos, posters) se almacenan en Cloudflare R2, bucket `gym-app`, carpeta `vitrina/`, con `R2StorageService` y las variables `R2_*`. La TV las lee por `R2_PUBLIC_URL`.
- Imágenes: patrón de `guardarImagen` (`app/(panel)/kiosko/actions.ts`; validación en `packages/domain/utils/imagenSubida.ts`).
- Videos: subida directa del navegador a R2 con URL prefirmada (esquiva el límite de 10 MB de server actions en `apps/web-admin/next.config.ts` y los límites del proxy). Se añaden al puerto `IArchivoStorageService` y a `R2StorageService` la URL prefirmada y `eliminar`. Requiere CORS (PUT desde el origen de web-admin) en el bucket, un paso manual en Cloudflare que se documenta en el plan. El ítem solo se crea cuando una server action `confirmarSubida` hace `HeadObject`, verifica tamaño y tipo, y borra el objeto si no cumple.
- Nombre de objeto nuevo (`randomUUID()`) en cada subida y `Cache-Control: public, max-age=31536000, immutable`: una URL ya vista nunca cambia de contenido.
- Al reemplazar o borrar una pieza se elimina el objeto anterior en R2.

### Formato de video aceptado
- **Solo H.264 en contenedor MP4** (se admite `.mov` si su códec es H.264). Resolución máxima 1080x1920, sin audio necesario (se reproduce mudo), tope de tamaño propio (100 MB). WebM no se acepta.
- Como la subida es directa y el servidor no ve el archivo, el navegador lo valida antes de subir leyendo las cajas MP4 hasta `stsd` para obtener el códec (`avc1` = H.264). Cualquier otro (`hvc1`/`hev1` = HEVC, el formato por defecto de los iPhone, VP9, etc.) se rechaza con un mensaje que explica cómo convertirlo: en el iPhone, Ajustes > Cámara > Formatos > "Más compatible" para grabaciones futuras, o convertir el archivo a H.264 (por ejemplo con HandBrake).
- El navegador genera el poster (primer fotograma) y lo sube como JPEG. Si el `<video>` falla en la TV, se muestra el poster o se salta la pieza sin detener la rotación.

### Migración sin tocar producción
El `.env` local apunta a producción y `packages/db/prisma7.config.ts` lo carga. Por eso:
- **No se ejecuta `prisma migrate dev`, `migrate deploy`, `db push` ni `migrate reset` contra ese `.env`, bajo ninguna circunstancia.**
- La migración se genera sin conectarse a ninguna base: `prisma migrate diff` entre el esquema de `HEAD` (`git show HEAD:packages/db/prisma/schema.prisma`) y el nuevo, con `--script`, y el SQL resultante se guarda en `prisma/migrations/<fecha>_vitrina/migration.sql`. Se confirman los nombres exactos de las opciones con `prisma migrate diff --help`.
- Para comprobarla se aplica el historial completo a un Postgres local vacío y separado (contenedor Docker en otro puerto) con una configuración propia, `packages/db/prisma7.local.config.ts`, que no carga `.env`, lee solo `DATABASE_URL_LOCAL` y aborta si el host no es `localhost`/`127.0.0.1`.
- La migración llega a producción al arrancar el contenedor tras el deploy (`docker-entrypoint.sh`).

## 2. Dashboard (web-admin)
- Módulo `apps/web-admin/app/(panel)/vitrina/` copiando la estructura de `kiosko/`: pestañas Entrenadores, Promos, Productos y Ajustes (duración, transición). Promos y Productos comparten `FormularioCartel` con interruptores por badge. Reordenar mueve el ítem en la lista global.
- Cada alta nace inactiva; el dashboard lo indica y ofrece el interruptor "Mostrar en la TV".
- Permiso igual que Kiosko (`apps/web-admin/lib/permisoKiosko.ts`: SOCIO o GERENTE).
- Menú: `Sidebar` en `apps/web-admin/app/(panel)/layout.tsx`, `MasSheet.tsx` y `NavegacionMobile.tsx`.
- UI con `packages/ui`.

## 3. App de TV (`apps/vitrina`)

### Empaquetado y arranque sin red
- Next con `output: "export"`. El APK incluye ese export como `webDir` y lo sirve localmente (`https://localhost`); no usa `server.url`. Así, al encender el TV sin internet la app abre igual y muestra el último contenido guardado: se cumple "nunca pantalla en negro" sin depender de una página de reintento. `server.url` queda solo para desarrollo, activado por una variable (`VITRINA_DEV_URL`).
- La clave de sede y la URL de la API ya no viajan por fragmento: el script de preparación escribe un `vitrina-config.json` dentro del bundle (`apiUrl`, `clave`) y la app lo lee al arrancar. La API ya responde con `Allow-Origin: *` y acepta `X-Kiosk-Api-Key`, así que el origen `https://localhost` funciona. Como el APK contiene la clave, sigue saliendo cifrado con 7z (repo público).
- Consecuencia: cambiar el contenido no requiere APK nuevo, pero cambiar el diseño o la lógica de la app sí.
- Pantalla completa para promos y productos; franjas de 3 columnas para entrenadores; videos mudos en bucle; pocas transiciones al inicio. Escala con `rem`/`clamp` como el kiosco (16 px a 1920x1080).

### Medios descargados una sola vez (cache-first)
- Almacén en disco: las piezas se guardan como archivos en el almacenamiento interno de la app (`Directory.Data` de `@capacitor/filesystem`), que persiste entre reinicios. Se descargan con **`@capacitor/file-transfer`** (`FileTransfer.downloadFile`, nativo, apto para videos grandes; `Filesystem.downloadFile` está deprecado desde 7.1.0) y se reproducen con `Capacitor.convertFileSrc(uri)` en `<video>`/`<img>`. La descarga va a un nombre temporal y se renombra al terminar, para no reproducir nunca un archivo a medias.
- Un índice (`url` → archivo local, tamaño) se guarda en `localStorage`. La interfaz del almacén (`obtener`, `guardar`, `eliminar`, `listar`) tiene una implementación de disco (APK) y una de respaldo con Cache API para el navegador y el desarrollo.
- Sustituir o eliminar: al sincronizar el manifiesto se descargan solo las URLs que falten y se borran del disco las que ya no aparezcan (pieza sustituida, retirada, vencida o eliminada). Se precargan antes de mostrarlas; mientras una pieza nueva baja, se sigue mostrando lo anterior. Los archivos huérfanos se limpian al arrancar comparando disco e índice.
- Si no hay espacio para una pieza, no se descarga y se conserva lo anterior.

### Aviso de cambios (SSE) sin sondeo constante
- La TV mantiene una conexión de salida a `GET /api/kiosco/vitrina/eventos` usando `fetch` con stream y la cabecera `X-Kiosk-Api-Key` (no `EventSource`, que no admite cabeceras). El servidor envía un latido cada ~25 s para que el proxy no la corte.
- Cuando la administración guarda, reordena, elimina o sustituye algo, la server action incrementa `vitrinaVersion` y emite `vitrina:cambio` para esa sede (emisor en memoria en `globalThis`, suficiente mientras web-admin corra en un solo contenedor; con varias instancias se cambia por `LISTEN/NOTIFY` de Postgres sin tocar la TV).
- Al recibir el evento, la TV pide el manifiesto y sincroniza el almacén. También lo pide al arrancar y cada vez que la conexión se restablece. Red de seguridad: sondeo lento cada 10 minutos. Reconexión con espera creciente (2 s hasta 60 s).
- Las fechas `inicio`/`fin` y el umbral de la tasa se evalúan localmente con el reloj.
- Decisión: SSE sobre FCM (aunque el equipo trae Google Play Services) para no depender de Firebase ni guardar su configuración en un repo público. FCM queda como mejora futura; el contrato "evento de cambio, luego pedir manifiesto" no cambiaría.

## 4. APK y GitHub Action
- Parametrizar `apps/kiosk-tv/capacitor` (`preparar.mjs`, `url.mjs`, plantilla Android) para reutilizarlo con otro `appId`, nombre, ícono y modo (remoto vs. empaquetado). Alternativa si es muy invasivo: `apps/vitrina-tv` con scripts compartidos.
- `.github/workflows/apk-vitrina.yml`, adaptado de `apk-kiosco.yml`: `workflow_dispatch`, inputs `sucursal` y URL de la API, secreto `VITRINA_CLAVE_<sucursal>`, `assembleDebug`, 7z cifrado con `KIOSCO_APK_PASSWORD`, artefacto con retención de 7 días. A diferencia del kiosco, el workflow instala el monorepo (`npm ci` en la raíz), compila `apps/vitrina` con `NEXT_PUBLIC_API_URL`, copia `out/` al `webDir` y luego corre la preparación y `cap sync`.
- Firma: se confirma que el kiosco ya firma con un keystore fijo y versionado (`apps/kiosk-tv/capacitor/android/app/debug.keystore`, usado por `signingConfigs.debug` en `build.gradle`). La vitrina usa el mismo patrón con su propio `appId`: las actualizaciones se instalan encima (`adb install -r`) sin perder el almacén ni los permisos. Ese keystore no debe cambiar nunca, porque otro obligaría a desinstalar y se perdería todo. `versionCode` sube con `github.run_number`. Contrapartida conocida: el keystore es público, y lo aceptamos porque instalar un APK exige acceso físico al equipo.
- Ícono: el escudo adjunto en los mipmap de Android y en el manifiesto/`icon.png` de `apps/vitrina`.

### Arranque con el TV (requisito)
- Un `BroadcastReceiver` con `RECEIVE_BOOT_COMPLETED` (y `QUICKBOOT_POWERON`) lanza `MainActivity`; se mantienen `LEANBACK_LAUNCHER`, `FLAG_KEEP_SCREEN_ON` y el modo inmersivo. Android 10+ restringe abrir actividades desde segundo plano, así que la app declara `SYSTEM_ALERT_WINDOW`.
- Camino normal: conceder "Mostrar sobre otras aplicaciones" en Ajustes. Camino por adb para equipos sin esa pantalla (o para instalaciones sin teclado):
  - `adb shell appops set <appId> SYSTEM_ALERT_WINDOW allow`
  - `adb shell appops set <appId> RUN_IN_BACKGROUND allow`
  - `adb shell dumpsys deviceidle whitelist +<appId>` (excluir de la optimización de batería)
  - comprobar con `adb shell appops get <appId> SYSTEM_ALERT_WINDOW`
- Alternativa: fijar la app como launcher por defecto del equipo. Todo queda en el README de la app. Se verifica apagando y encendiendo el equipo físico; si el fabricante lo bloquea, se documenta su ajuste de "autoinicio".

## Reutilización del kiosco
En el plan, cada pieza reutilizada se cita con su archivo exacto. Candidatas ya localizadas (el plan las confirma): `.github/workflows/apk-kiosco.yml`, `apps/kiosk-tv/capacitor/scripts/preparar.mjs` y `url.mjs`, `apps/kiosk-tv/capacitor/android/app/build.gradle` y `debug.keystore`, `MainActivity.java` y `AndroidManifest.xml` de `apps/kiosk-tv`, `apps/kiosk/lib/versionWebView.ts` (aviso de WebView < 111), `apps/kiosk/app/globals.css` (escala con `rem`), `apps/web-admin/lib/kiosco.ts`, `apps/web-admin/app/api/kiosco/estado/route.ts`, `apps/kiosk/lib/api.ts` y `useInfoKiosco.ts` como referencia, `packages/theming/tokens.ts`. No se reutiliza: `sw.js` y la cola de check-ins (no aplican), `claveFragmento.ts` (la clave va en `vitrina-config.json`) ni el Dockerfile (no hay web que alojar).

## Orden de construcción
1. Migración (sin tocar producción) y dominio con tests.
2. API `/api/kiosco/vitrina`, SSE y subida de medios a R2.
3. Módulo del dashboard.
4. App `apps/vitrina`: reproductor, almacén en disco y SSE.
5. APK, workflow, ícono y arranque con el TV.

## Verificación
- `npm test --workspace packages/domain` (fechas, orden, intercalado, repartos 1 a 8, umbral de la tasa).
- `npm run build` y `npm run lint` en web-admin y vitrina.
- Migración aplicada a un Postgres local vacío con la configuración local y sin tocar el `.env`.
- API con y sin clave; cargar un entrenador, una promo y un producto desde el dashboard (nacen inactivos); ver la vitrina a 1920x1080 y sin red.
- Subir un video HEVC de iPhone y comprobar el rechazo con su mensaje; subir uno H.264 grande (>50 MB) y comprobar que queda en R2 (`vitrina/`) y que el reemplazo borra el anterior.
- Cambiar algo en el dashboard con la TV conectada: debe reflejarse en segundos. Cortar y restablecer la red de la TV: debe reconectar y ponerse al día. Verificar que el proxy de producción no corta el SSE.
- Con la TV ya cargada: pasar varias diapositivas y reiniciar la app sin red sin peticiones a R2. Sustituir una pieza: solo se descarga la nueva y el archivo viejo se borra del equipo (`adb shell`). Eliminar una pieza en el dashboard: la TV la borra.
- Encender el equipo sin internet: la app abre sola y muestra el último contenido.
- Disparar el workflow y comprobar el artefacto cifrado; instalar el APK y luego una versión nueva encima, y confirmar que se conservan el almacén y los permisos.
- Apagar y encender el equipo para confirmar el arranque automático, también con los permisos concedidos solo por adb.
- Tasa con más de 72 h: el equivalente en Bs desaparece y el precio en USD se mantiene.

## Valores por defecto (editables en Ajustes)
Duración por cartel (12 s) y estilo de transición. Las preguntas abiertas que no cambian el diseño (contacto en las promos, métricas) quedan fuera de la v1.
