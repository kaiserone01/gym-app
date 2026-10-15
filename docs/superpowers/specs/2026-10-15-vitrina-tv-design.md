# Vitrina-AdrenalinaXtremeGYM: diseño

## Objetivo
Convertir una TV Android del gimnasio (horizontal) en una vitrina que presenta al staff de entrenadores (foto o video vertical), exhibe carteles de promos y exhibe productos con precio, oferta y descuento. Todo se controla desde el web-admin. Se compila como APK por GitHub Action, como el kiosco, con el escudo de la marca como ícono. Identidad: negro, verde lima (`#93e83a`) y blanco (tokens `--gx-*` en `packages/theming/tokens.ts`).

## Decisiones
- Dispositivo: Android TV oficial (con Google Play Services), horizontal, una sola TV.
- La app web se empaqueta dentro del APK (export estático). No se carga por URL remota, salvo en desarrollo.
- Carteles de promos y productos: se suben ya diseñados (imagen o video), con fecha de inicio y fin.
- Productos: independientes del catálogo `Producto` de Caja (sin enlace ni sincronización). Solo exhibición, sin carrito ni cobro.
- Badges editables sobre el diseño (precio, oferta, descuento, etiqueta), cada uno activable o desactivable.
- Entrenadores: la vitrina es **independiente del módulo de usuarios**. Cada ítem guarda su propio nombre y su propio medio vertical. Se muestran en franjas de exactamente 3 columnas.
- Enfoque: app propia `apps/vitrina` con APK propio (`apps/vitrina-tv`) y workflow propio.

## Fuera de alcance (v1)
Más de una TV o sede, sonido, interacción, datos de miembros, promos en media pantalla, franja inferior, promos urgentes o por hora, vista previa, estado de la TV, deshacer.

## 1. Datos y API

### Modelo
Una sola tabla de contenido. Migración nueva en `packages/db/prisma/migrations/` (nombre en español), **solo aditiva** (ver "Migración").

`VitrinaItem` (ligado a `Sucursal` por `sucursalId`, índice `(sucursalId, orden)`):
- Comunes: `tipo` (ENTRENADOR/PROMO/PRODUCTO), `orden` (entero), `activo` (**por defecto `false`**: todo ítem nuevo nace inactivo hasta que la administración lo activa), `duracionSeg?` (nulo = la de la sede), `inicio?`, `fin?`, `mediaUrl` (obligatorio), `mediaTipo` (IMAGEN/VIDEO), `posterUrl?`, `createdAt`, `updatedAt`.
- Badges (PROMO y PRODUCTO; nulos si no aplican): `precioUSD?`, `ofertaUSD?`, `descuentoPct?`, `etiqueta?` y banderas `mostrarPrecio/Oferta/Descuento/Etiqueta/EquivalenteBs`. El descuento es manual o calculado de precio y oferta. La TV dibuja los badges con la marca (precio normal tachado, oferta en verde lima); no van incrustados en la imagen.
- Entrenador (solo `tipo = ENTRENADOR`): `nombre` (obligatorio, propio del ítem), `especialidad?`, `frase?`, banderas `mostrarMedio/Nombre/Especialidad/Frase`. **No hay `usuarioId`, ni `@@unique`, ni respaldo con `UsuarioAdmin.fotoUrl`, ni validación de rol o sede, ni dependencia del estado del usuario**: el `mediaUrl` vertical es obligatorio. Opcional en el formulario: al crear, un selector con la lista de entrenadores existente solo para copiar el nombre al campo, sin guardar vínculo.
- Las reglas por tipo (campos obligatorios o prohibidos según `tipo`) se validan en el dominio y en la server action, no con restricciones de BD.

`Sucursal` gana: `vitrinaDuracionSeg` (por defecto 12), `vitrinaTransicion` (estilo; por defecto fundido) y `vitrinaVersion` (entero que se incrementa en la misma transacción de cada cambio de contenido).

### Orden, franjas e intercalado
- `orden` es global por sede: la administración ordena entrenadores, promos y productos en una sola lista (vista "Secuencia", sección 2).
- Se resuelve así: se descartan los ítems inactivos y los que están fuera de `inicio`/`fin`. Después, los entrenadores que quedan **consecutivos** en la lista se agrupan en franjas; un cartel de promo o producto entre dos entrenadores corta el grupo. Así la administración decide cómo se intercalan moviendo ítems en la secuencia.
- Cada franja tiene como máximo 3 entrenadores. Un grupo de `n` entrenadores se reparte en `ceil(n/3)` franjas lo más parejas posible, con las mayores primero y sin dejar una franja de 1 salvo que `n = 1`: 1→1; 2→2; 3→3; 4→2+2; 5→3+2; 6→3+3; 7→3+2+2; 8→3+3+2.
- Una franja con 1 o 2 entrenadores conserva el ancho de columna de las de 3 y se centra: nunca se estiran las fotos.
- Duración de una franja: la `duracionSeg` de su primer entrenador, o la de la sede.
- Fotos verticales 9:16 en columnas de ~640x1080 (1920/3): el recorte "cover" es de ~5% de la altura. Con 4 columnas (480 px) sería de ~21%, por eso se fija en 3.
- **Videos en franjas:** en una franja solo se reproduce un video a la vez; los demás muestran su póster. La columna activa rota cada `duración de la franja / número de videos`. Esto limita el decodificado simultáneo en TV box modestos; el punto 0 del orden de construcción lo comprueba en el equipo real.

### Dominio puro (con tests en `packages/domain`)
Función de secuencia: dado el instante efectivo, la lista de ítems y la duración de la sede, devuelve las diapositivas (carteles y franjas). Cubre fechas, orden, intercalado y los repartos 1 a 8. Es pura (sin Prisma, sin Next, sin red) porque **corre también en la TV** (ver "Excepción al ADR-001").

### Tasa BCV y equivalente en Bs
- **No hay workflow aparte.** `GET /api/kiosco/vitrina` reutiliza `orquestadorTasa.obtenerTasaVigenteFresca()` de `apps/web-admin/lib/tasaBcv.ts`, igual que `api/kiosco/estado/route.ts`, y devuelve `tasaBcv: { valor, fecha } | null` con la misma forma que esa ruta (`fecha` en ISO; `null` si `SinTasaDisponibleError`). No existe `tasaActualizadaEn` ni umbral de horas: `TasaCambio` guarda una fila por día (upsert por `fecha`), así que `createdAt` solo marca la primera sincronización y un feriado largo ocultaría el Bs sin motivo.
- Criterio: el de `packages/domain/use-cases/ObtenerTasaVigente.ts` (`fecha valor < hoy` ⇒ `DESACTUALIZADA`). Se extrae a una función pura en `packages/domain` (por ejemplo `utils/estadoTasa.ts`: `estadoDeTasa(fechaTasa, hoy)`), que usan `obtenerTasaVigente` y la TV con `diaCalendarioCaracas(instanteEfectivo)` de `packages/domain/utils/fechaCaracas.ts`.
- La TV oculta el equivalente en Bs **solo si la tasa está `DESACTUALIZADA`** (o no hay tasa). El precio en USD siempre se muestra.
- El Bs se calcula sobre el **precio vigente**: la oferta si está activa (`mostrarOferta` y `ofertaUSD` presentes), si no el precio.
- `formatearBs` se mueve de `apps/web-admin/app/(panel)/tasaBcvFija.ts` a `packages/domain/utils/formatearBs.ts`; web-admin lo importa desde ahí (sin copia en `tasaBcvFija.ts`) y la vitrina lo usa. No se crea otra copia; `apps/kiosk` no se toca (su `FichaReposo.tsx` tiene su propio formateo y el ADR le impide importar el dominio).

### Reloj y manifiesto
- `GET /api/kiosco/vitrina` (`apps/web-admin/app/api/kiosco/vitrina/route.ts`), mismo patrón que `api/kiosco/estado/route.ts`: `OPTIONS` + `GET`, `sucursalDeKiosco` y `jsonKiosco` de `apps/web-admin/lib/kiosco.ts`. Devuelve: ítems activos (excluye también los inactivos), `vitrinaVersion`, `tasaBcv`, ajustes de sede y `servidorAhora` (hora del servidor, ISO).
- **El manifiesto excluye los ítems ya vencidos (`fin` < ahora del servidor) y mantiene los futuros (`inicio` > ahora)**. Así la TV borra los archivos de lo vencido y puede mostrar lo futuro cuando llegue su fecha, incluso sin red.
- La TV guarda el último `servidorAhora`. Instante efectivo = `max(reloj de la TV, último servidorAhora guardado)`: si tras un corte de luz el reloj marca una fecha anterior (equipos sin pila de reloj), se usa la guardada para `inicio`/`fin` y para el estado de la tasa. Si el reloj está adelantado se usa tal cual.
- `GET /api/kiosco/vitrina/eventos`: flujo SSE (sección 3). `dynamic = "force-dynamic"` y sin buffering.

### Medios en R2
Todas las piezas (fotos y videos de entrenadores, carteles, posters) se almacenan en Cloudflare R2, bucket `gym-app`, carpeta `vitrina/`, con `R2StorageService` y las variables `R2_*`. La TV las lee por `R2_PUBLIC_URL`.
- **Dependencia nueva:** `@aws-sdk/s3-request-presigner` en `packages/infrastructure`. Se añaden al puerto `IArchivoStorageService` y a `R2StorageService` la URL prefirmada y `eliminar`. Hoy `subir()` no pone `Cache-Control` ni el comentario de la clase contempla URL prefirmada ni CORS: se actualiza (parámetro opcional `cacheControl`, y la prefirmada lo incluye).
- Videos: subida directa del navegador a R2 con URL prefirmada (esquiva el límite de 10 MB de server actions en `apps/web-admin/next.config.ts` y los límites del proxy). Requiere CORS (PUT desde el origen de web-admin) en el bucket, un paso manual en Cloudflare que se documenta en el plan. El ítem solo se crea cuando una server action `confirmarSubida` hace `HeadObject`, verifica tamaño y tipo, y borra el objeto si no cumple.
- Imágenes: suben por server action, pero **no pasan por `comprimirAvatar`** (reduce a 384x384, en `app/(panel)/miembros/comprimirImagen.ts`). Se define para la vitrina: máximo 1920 px de lado mayor (carteles 16:9 de 1920x1080; fotos verticales de 1080x1920), re-codificadas en el navegador a WebP calidad 0.85 (JPEG de respaldo), y un tope propio `MAX_BYTES_IMAGEN_VITRINA = 8 MB`, porque un PNG de 1920x1080 puede superar los 5 MB de `MAX_BYTES_IMAGEN`. `extensionDeImagen` (`packages/domain/utils/imagenSubida.ts`) recibe el tope como parámetro opcional (por defecto el actual) en lugar de duplicarse. El límite de 10 MB del body de server actions cubre ese tope.
- Nombre de objeto nuevo (`randomUUID()`) en cada subida y `Cache-Control: public, max-age=31536000, immutable`: una URL ya vista nunca cambia de contenido.
- Al reemplazar o borrar una pieza se elimina el objeto anterior en R2.

### Formato de video aceptado
- **Solo H.264 en contenedor MP4** (se admite `.mov` si su códec es H.264). El códec puede venir como `avc1` o `avc3`: se aceptan ambos. Resolución máxima mostrada 1080x1920, sin audio necesario (se reproduce mudo), tope de tamaño propio (100 MB). WebM no se acepta.
- El navegador valida antes de subir leyendo las cajas MP4 hasta `stsd` (códec) y `tkhd` (matriz de transformación). Cualquier otro códec (`hvc1`/`hev1` = HEVC, el formato por defecto de los iPhone; VP9; etc.) se rechaza con un mensaje que explica cómo convertirlo: en el iPhone, Ajustes > Cámara > Formatos > "Más compatible", o convertir el archivo a H.264 (por ejemplo con HandBrake).
- **Rotación:** los videos grabados en vertical suelen venir horizontales con una marca de rotación de 90°/270° en `tkhd`. El validador calcula las dimensiones **mostradas** (aplicando la rotación) para el límite de resolución y para exigir orientación vertical en los entrenadores. En la TV se usan las dimensiones mostradas (`videoWidth`/`videoHeight` ya las respetan en WebView) y se comprueba en el equipo real.
- El navegador genera el poster (primer fotograma, con la rotación aplicada) y lo sube como JPEG. Si el `<video>` falla en la TV, se muestra el poster o se salta la pieza sin detener la rotación.

### Migración sin tocar producción
El `.env` local apunta a producción y `packages/db/prisma7.config.ts` lo carga. Por eso:
- **No se ejecuta `prisma migrate dev`, `migrate deploy`, `db push` ni `migrate reset` contra ese `.env`, bajo ninguna circunstancia.**
- Se crea `packages/db/prisma7.local.config.ts`: no carga `.env`, lee solo `DATABASE_URL_LOCAL` y aborta si el host no es `localhost`/`127.0.0.1`. Se usa para toda operación de Prisma de esta tarea (`--config`).
- La migración se genera con `prisma migrate diff --script` entre el esquema de `HEAD` (`git show HEAD:packages/db/prisma/schema.prisma`) y el nuevo, con esa config local; el SQL se guarda en `prisma/migrations/<fecha>_vitrina/migration.sql`. Se confirman los nombres exactos de las opciones con `prisma migrate diff --help`.
- Se comprueba aplicando el historial completo (más la nueva) a un Postgres local vacío (contenedor Docker en otro puerto) y verificando que **no hay drift**: `prisma migrate diff --exit-code` entre la base resultante y el esquema da 0.
- **Solo aditiva:** tablas y enums nuevos, columnas nuevas en `Sucursal` con valor por defecto; nada de `DROP`, `ALTER` de tipos ni renombrados. Razón: `docker-entrypoint.sh` corre `prisma migrate deploy` con `set -e` y, si falla, web-admin no arranca (y el check-in del kiosco queda caído).
- La migración llega a producción al arrancar el contenedor tras el deploy.

## 2. Dashboard (web-admin)
- Módulo `apps/web-admin/app/(panel)/vitrina/` copiando la estructura de `kiosko/`: pestañas **Secuencia**, Entrenadores, Promos, Productos y Ajustes (duración, transición). Promos y Productos comparten `FormularioCartel` con interruptores por badge.
- **Vista "Secuencia":** una lista única con todos los ítems (entrenadores, promos y productos) en el orden de reproducción, donde se ordena e intercala. El mecanismo es **solo botones subir/bajar** (sin arrastrar): funciona igual en escritorio y móvil y no necesita librería. Muestra qué ítems quedan agrupados en franjas y cuáles están inactivos o fuera de fechas. Cada alta nace inactiva con el interruptor "Mostrar en la TV".
- Permiso igual que Kiosko (`apps/web-admin/lib/permisoKiosko.ts`: SOCIO o GERENTE).
- Menú: `Sidebar` en `apps/web-admin/app/(panel)/layout.tsx`, `MasSheet.tsx` y `NavegacionMobile.tsx`.
- UI con `packages/ui`.
- Cada server action que cambia contenido: escribe e incrementa `vitrinaVersion` en una transacción y, **después del commit**, emite `vitrina:cambio` (nunca dentro de la transacción).

## 3. App de TV (`apps/vitrina`)

### Excepción al ADR-001
`docs/adr/ADR-001-gym-app-sesion.md` fija `apps/kiosk` como "cero lógica de negocio" y la app no importa `@gym-app/domain`. La vitrina necesita en la TV la función de secuencia (filtrar por fecha cambia las franjas), `estadoDeTasa`, `formatearBs` y `diaCalendarioCaracas`. **Se declara la excepción** (y se registra en un ADR corto nuevo): `apps/vitrina` importa de `packages/domain` solo funciones puras, por ruta (`@gym-app/domain/utils/...`), nunca `infrastructure` ni `db`; y se agrega `@gym-app/domain` a `transpilePackages` de `apps/vitrina` (como en `apps/web-admin/next.config.ts`). `apps/kiosk` no cambia.

### Empaquetado y arranque sin red
- Next con `output: "export"`. El APK incluye ese export como `webDir` y lo sirve localmente (`https://localhost`); no usa `server.url`. Así, al encender el TV sin internet la app abre igual y muestra el último contenido guardado: se cumple "nunca pantalla en negro". `server.url` queda solo para desarrollo, activado por una variable (`VITRINA_DEV_URL`).
- La clave de sede y la URL de la API viajan en un `vitrina-config.json` dentro del bundle (`apiUrl`, `clave`), escrito por el script de preparación. La API ya responde con `Allow-Origin: *` y acepta `X-Kiosk-Api-Key`. Como el APK contiene la clave, sigue saliendo cifrado con 7z (repo público), se conserva `loggingBehavior: "none"` y `android.webContentsDebuggingEnabled: false`, y **no se activa `CapacitorHttp`**.
- Consecuencia: cambiar el contenido no requiere APK nuevo; cambiar el diseño o la lógica de la app sí.
- Pantalla completa para promos y productos; franjas de 3 columnas para entrenadores; videos mudos en bucle; pocas transiciones al inicio. Escala con `rem`/`clamp` como el kiosco (16 px a 1920x1080).

### Medios descargados una sola vez (cache-first)
- Almacén en disco: las piezas se guardan como archivos en el almacenamiento interno de la app (`Directory.Data` de `@capacitor/filesystem` 8.x). Se descargan con **`@capacitor/file-transfer` en `^2.0.6`** (`FileTransfer.downloadFile`, nativo, apto para videos grandes; `Filesystem.downloadFile` está deprecado desde 7.1.0). Ese paquete no sigue la numeración de Capacitor: su serie 2.x es la que declara `@capacitor/core >=8`, que es lo que usa el kiosco (8.5.3). Se reproducen con `Capacitor.convertFileSrc(uri)`. La descarga va a un nombre temporal y se renombra al terminar, para no reproducir nunca un archivo a medias.
- Un índice (`url` → archivo local, tamaño) se guarda en `localStorage`. La interfaz del almacén (`obtener`, `guardar`, `eliminar`, `listar`) tiene una implementación de disco (APK) y una de respaldo con Cache API para el navegador y el desarrollo.
- Sustituir o eliminar: al sincronizar el manifiesto se descargan solo las URLs que falten y se borran del disco las que ya no aparezcan (pieza sustituida, retirada, **vencida** o eliminada). Se precargan antes de mostrarlas; mientras una pieza nueva baja, se sigue mostrando lo anterior. Los archivos huérfanos se limpian al arrancar comparando disco e índice.
- Si no hay espacio para una pieza, no se descarga y se conserva lo anterior.

### Aviso de cambios (SSE) sin sondeo constante
- La TV mantiene una conexión de salida a `GET /api/kiosco/vitrina/eventos` usando `fetch` con stream y la cabecera `X-Kiosk-Api-Key` (no `EventSource`, que no admite cabeceras). El servidor envía un latido cada ~25 s para que el proxy no la corte.
- `vitrina:cambio` se emite **después** del commit de la transacción que incrementó `vitrinaVersion`; el emisor en memoria vive en `globalThis` (suficiente con un solo contenedor; con varias instancias se cambia por `LISTEN/NOTIFY` de Postgres sin tocar la TV).
- Al recibir el evento, la TV pide el manifiesto y sincroniza el almacén. También lo pide al arrancar y al restablecerse la conexión. **El sondeo de respaldo cada 10 minutos aplica siempre el manifiesto completo, sin condicionarlo a `vitrinaVersion`** (así una versión mal comparada o un evento perdido no deja la TV desfasada). Reconexión con espera creciente (2 s hasta 60 s).
- Las fechas `inicio`/`fin` y el estado de la tasa se evalúan localmente con el instante efectivo (ver "Reloj y manifiesto").
- Decisión: SSE sobre FCM (aunque el equipo trae Google Play Services) para no depender de Firebase ni guardar su configuración en un repo público. FCM queda como mejora futura; el contrato "evento de cambio, luego pedir manifiesto" no cambiaría.

## 4. APK y GitHub Action

### Cáscara Android propia: `apps/vitrina-tv`
La plantilla del kiosco (`apps/kiosk-tv/capacitor/android`) tiene `com.adrenalina.kiosco` fijo en `namespace`, `applicationId` y la ruta Java (`app/src/main/java/com/adrenalina/kiosco/MainActivity.java`), `versionCode 1` y un manifiesto sin `receiver`. Por eso **no se parametriza ni se toca**: la vitrina usa `apps/vitrina-tv` con plantilla propia (`com.adrenalina.vitrina`, su `MainActivity`, receiver de arranque, `versionCode` desde el workflow, nombre e ícono propios).
- Scripts: el `preparar.mjs` del kiosco está atado al modo remoto (genera `server.url` y `offline.html`), así que la vitrina lleva su propio `preparar.mjs` (modo empaquetado, escribe `vitrina-config.json`); no se importan módulos del kiosco. Lo que se comparte es el patrón y los pasos del workflow, copiados y adaptados.
- **Garantía de no regresión:** el cambio no modifica ningún archivo bajo `apps/kiosk-tv/` ni `.github/workflows/apk-kiosco.yml`. Se verifica con `git diff --stat` contra esos paths al cerrar cada tarea.

### Workflow
`.github/workflows/apk-vitrina.yml`, adaptado de `apk-kiosco.yml`: `workflow_dispatch`, inputs `sucursal` y URL de la API, secreto `VITRINA_CLAVE_<sucursal>`, `assembleDebug`, 7z cifrado con `KIOSCO_APK_PASSWORD`, artefacto con retención de 7 días. A diferencia del kiosco, instala el monorepo (`npm ci` en la raíz), compila `apps/vitrina` (la URL de la API no es de build: va en `vitrina-config.json` al preparar el APK), copia `out/` al `webDir` de `apps/vitrina-tv` y corre preparación y `cap sync`.

### Firma
El kiosco firma con un keystore fijo y versionado (`apps/kiosk-tv/capacitor/android/app/debug.keystore`, usado por `signingConfigs.debug` en `build.gradle`). La vitrina usa una copia en `apps/vitrina-tv` con el mismo patrón y su propio `applicationId`: las actualizaciones se instalan encima (`adb install -r`) sin perder el almacén ni los permisos. Ese keystore no debe cambiar nunca. `versionCode` sube con `github.run_number`. Contrapartida: el keystore es público; se acepta porque instalar un APK exige acceso físico al equipo.

### Ícono
El escudo adjunto en los mipmap de Android y en el manifiesto/`icon.png` de `apps/vitrina`.

### Arranque con el TV (requisito)
- Un `BroadcastReceiver` con `RECEIVE_BOOT_COMPLETED` (y `QUICKBOOT_POWERON`) lanza `MainActivity`; se mantienen `LEANBACK_LAUNCHER`, `FLAG_KEEP_SCREEN_ON` y el modo inmersivo. Android 10+ restringe abrir actividades desde segundo plano, así que la app declara `SYSTEM_ALERT_WINDOW`.
- Camino normal: conceder "Mostrar sobre otras aplicaciones" en Ajustes. Camino por adb para equipos sin esa pantalla:
  - `adb shell appops set <appId> SYSTEM_ALERT_WINDOW allow`
  - `adb shell appops set <appId> RUN_IN_BACKGROUND allow`
  - `adb shell dumpsys deviceidle whitelist +<appId>`
  - comprobar con `adb shell appops get <appId> SYSTEM_ALERT_WINDOW`
- **Al terminar de configurar la TV se desactiva la depuración por adb** (Opciones de desarrollador) y se documenta en el README.
- Alternativa: fijar la app como launcher por defecto. Todo queda en el README de la app. Se verifica apagando y encendiendo el equipo físico; si el fabricante lo bloquea, se documenta su ajuste de "autoinicio".

## Reutilización del kiosco
En el plan, cada pieza reutilizada se cita con su archivo exacto. Candidatas ya localizadas (el plan las confirma): `.github/workflows/apk-kiosco.yml` (patrón de pasos), `apps/kiosk-tv/capacitor/scripts/preparar.mjs` (referencia), `apps/kiosk-tv/capacitor/android/app/build.gradle` y `debug.keystore`, `MainActivity.java` y `AndroidManifest.xml` (referencia para la plantilla propia), `apps/kiosk/lib/versionWebView.ts` (aviso de WebView < 111), `apps/kiosk/app/globals.css` (escala con `rem`), `apps/web-admin/lib/kiosco.ts`, `apps/web-admin/app/api/kiosco/estado/route.ts`, `apps/web-admin/lib/tasaBcv.ts`, `apps/kiosk/lib/api.ts` y `useInfoKiosco.ts` como referencia, `packages/theming/tokens.ts`. No se reutiliza: `sw.js` y la cola de check-ins (no aplican), `claveFragmento.ts` (la clave va en `vitrina-config.json`), el Dockerfile (no hay web que alojar) ni `apps/kiosk-tv/capacitor/` como plantilla.

## Orden de construcción
0. **Prueba en la TV real (antes de construir):** 3 videos H.264 reproducidos a la vez, arranque en frío sin red y la hora que marca el equipo tras un corte de luz. Si los 3 simultáneos no rinden, el límite de un video por franja ya está previsto; si la hora no sobrevive, el reloj efectivo la cubre.
1. Migración (sin tocar producción) y dominio con tests (secuencia, `estadoDeTasa`, `formatearBs` movido).
2. API `/api/kiosco/vitrina`, SSE y subida de medios a R2.
3. Módulo del dashboard, incluida la vista Secuencia.
4. App `apps/vitrina`: reproductor, almacén en disco y SSE.
5. `apps/vitrina-tv`, workflow, ícono y arranque con el TV.

## Verificación
- `npm test --workspace packages/domain` (fechas, orden, intercalado, repartos 1 a 8, `estadoDeTasa`, Bs sobre precio vigente).
- `npm run build` y `npm run lint` en web-admin y vitrina; web-admin sigue compilando con `formatearBs` movido.
- Migración aplicada a un Postgres local vacío con la configuración local, sin drift y sin tocar el `.env`.
- API con y sin clave; `tasaBcv` con la misma forma que `/api/kiosco/estado`; manifiesto sin vencidos y con futuros.
- Cargar un entrenador, una promo y un producto desde el dashboard (nacen inactivos); ordenar en la vista Secuencia; ver la vitrina a 1920x1080 y sin red.
- Videos: HEVC de iPhone rechazado con su mensaje; H.264 con marca de rotación aceptado y mostrado derecho en la TV; H.264 grande (>50 MB) en R2 (`vitrina/`) y reemplazo que borra el anterior. PNG de 1920x1080 de más de 5 MB aceptado tras la compresión.
- Cambiar algo en el dashboard con la TV conectada: se refleja en segundos. Cortar y restablecer la red de la TV: reconecta y se pone al día. Verificar que el proxy de producción no corta el SSE.
- Con la TV ya cargada: pasar varias diapositivas y reiniciar la app sin red sin peticiones a R2. Sustituir una pieza: solo se descarga la nueva y el archivo viejo se borra (`adb shell`). Eliminar o vencer una pieza: la TV borra el archivo.
- **Desenchufar la TV y encenderla sin internet:** abre sola, muestra el último contenido y respeta `inicio`/`fin` y el estado de la tasa con el reloj efectivo.
- Workflow: artefacto cifrado; instalar el APK y luego una versión nueva encima, y confirmar que se conservan almacén y permisos. `git diff --stat` sin cambios en `apps/kiosk-tv/` ni `apk-kiosco.yml`.
- Arranque automático tras apagar y encender, también con permisos concedidos solo por adb; depuración por adb desactivada al final.
- Tasa `DESACTUALIZADA`: el equivalente en Bs desaparece y el USD se mantiene; con un feriado largo y tasa de ayer al día siguiente de sincronizar, no se oculta sin motivo.

## Valores por defecto (editables en Ajustes)
Duración por cartel (12 s) y estilo de transición. Las preguntas abiertas que no cambian el diseño (contacto en las promos, métricas) quedan fuera de la v1.
