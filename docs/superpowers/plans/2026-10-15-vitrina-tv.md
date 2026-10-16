# Vitrina-AdrenalinaXtremeGYM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una TV Android del gimnasio que muestra, sola y sin depender de internet, entrenadores (franjas de 3), promos y productos con badges de precio, controlada desde el dashboard de web-admin.

**Architecture:** App estática `apps/vitrina` (Next export) empaquetada dentro de un APK propio (`apps/vitrina-tv/capacitor`, Capacitor 8). Un manifiesto (`GET /api/kiosco/vitrina`) y un flujo SSE (`/eventos`) salen de web-admin; los medios viven en R2 y la TV los guarda como archivos. La lógica de secuencia, tasa, reloj y validación es código puro en `packages/domain`, compartido por web-admin y la TV (excepción documentada al ADR-001).

**Tech Stack:** Next 16 (export), React 19, Tailwind 4, Prisma 7 + Postgres, Cloudflare R2 (`@aws-sdk/client-s3` + `s3-request-presigner`), Vitest 5, Capacitor 8.5 (`@capacitor/filesystem` ^8.1.4, `@capacitor/file-transfer` ^2.0.6), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-15-vitrina-tv-design.md`

## Global Constraints

- Todo texto de UI, commits y documentación va en español.
- **Git: el agente nunca ejecuta `git add`, `git commit` ni `git push`.** Deja los cambios en el working tree y, al final de cada tarea, sugiere el mensaje de commit (una sola línea, en español, sin cuerpo y sin firmas: nada de `Co-Authored-By` ni `Claude-Session`). El usuario hace commit, push y deploy.
- **Prohibido ejecutar con la config por defecto (`prisma7.config.ts`, que carga el `.env` de producción):** `npx prisma db seed`, `prisma migrate dev`, `migrate deploy`, `migrate reset`, `db push` y **cualquier script `db:*` del repo** (`npm run db:...`, `npm run migrate:dev`, etc.). No hace falta seed: la organización `zip-gym` ya existe. Toda operación de Prisma de este plan usa `--config prisma7.local.config.ts`, que solo acepta una base en `localhost`.
- **Dos deploys, los hace el usuario** (ver "Despliegues y puntos de control"): el primero (a `main`) al terminar la Task 6, ya hecho; el segundo al final del plan, uniendo la rama `vitrina` con `main`.
- **Rama `vitrina`:** desde el Deploy 1 todo el trabajo va en la rama `vitrina` (el usuario hace los push ahí); `main` no se toca hasta el Deploy 2.
- **PC limitado: nada pesado se ejecuta en local.** Solo se edita código y se corren los tests unitarios livianos de `packages/domain` (`npm test --workspace packages/domain`). **No** se ejecuta en local `npm run build`, `next dev`, `tsc`, `eslint`, `docker` ni emuladores. Tipos, lint, tests de `apps/vitrina` y build de Docker corren en la nube: el workflow `.github/workflows/verificar-vitrina.yml` (push a `vitrina`) y el servicio de pruebas de EasyPanel. Excepciones mínimas y ya acordadas en el plan: `npm install ... --package-lock-only` (solo actualiza `package-lock.json`, no baja paquetes), `npm run iconos` de `apps/vitrina-tv/capacitor` (script corto con dependencias ya instaladas), `curl` y `gh`.
- **La rama `vitrina` no agrega migraciones.** El servicio de pruebas corre `migrate deploy` contra la base de producción al arrancar; si alguna tarea necesitara una migración, **detenerse y avisar al usuario**.
- **Sin emulador de Android:** el APK se prueba directamente en la TV real.
- La migración es **solo aditiva** (tablas, enums y columnas con valor por defecto; sin `DROP`, `RENAME` ni `ALTER COLUMN`): `docker-entrypoint.sh` corre `migrate deploy` con `set -e` y, si falla, web-admin y el check-in no arrancan.
- No se modifica ningún archivo bajo `apps/kiosk-tv/` ni `.github/workflows/apk-kiosco.yml`. `apps/kiosk` no cambia (salvo lo que este plan nombre explícitamente: nada).
- `apps/vitrina` importa de `@gym-app/domain` **solo funciones puras por ruta** (`@gym-app/domain/utils/...`, `.../services/...`, `.../entities/...`), nunca `@gym-app/infrastructure` ni `@gym-app/db`.
- Video aceptado: **H.264 (`avc1` o `avc3`) en MP4 (o `.mov`)**, mostrado ≤ 1080x1920 (lado mayor ≤ 1920, menor ≤ 1080), ≤ 100 MB, mudo. WebM no. Entrenadores: vertical.
- Imagen de la vitrina: lado mayor ≤ 1920 px, WebP calidad 0.85 (JPEG de respaldo), tope `MAX_BYTES_IMAGEN_VITRINA = 8 MB`. No se usa `comprimirAvatar`.
- Franjas de entrenadores: **3 columnas fijas**; `n` entrenadores se reparten en `ceil(n/3)` franjas parejas (4→2+2, 5→3+2, 7→3+2+2), nunca una franja de 1 salvo `n = 1`.
- Bs: se oculta **solo** si la tasa está `DESACTUALIZADA` (`fecha < hoy` en día de Caracas, criterio de `ObtenerTasaVigente`) o no hay tasa; se calcula sobre el precio vigente (oferta activa, si no el precio).
- Reloj: instante efectivo = `max(reloj de la TV, último servidorAhora guardado)`.
- SSE: latido cada 25 s; sondeo de respaldo cada 10 min que **siempre** aplica el manifiesto completo; reconexión 2 s → 60 s; `vitrina:cambio` se emite **después** del commit.
- APK: `loggingBehavior: "none"`, `webContentsDebuggingEnabled: false`, sin `CapacitorHttp`, sin `server.url` salvo `VITRINA_DEV_URL`; keystore fijo y versionado (no cambiar nunca); `versionCode` = `github.run_number`; se desactiva la depuración por adb al terminar de instalar.
- Todo ítem nuevo nace `activo = false`.
- Toda prueba manual se hace contra la base de producción **con la sede y la API key de `zip-gym`** (organización espejo de pruebas), **nunca** con las de `gym-demo` ni las de otra organización. Las pruebas de las Tasks 8 a 13 usan el servicio de pruebas `gym-app-vitrina` de EasyPanel (ver "Entorno de pruebas"), que comparte base de datos y bucket R2 con producción.
- Para probar el aviso de cambios (SSE), el dashboard y la vitrina deben apuntar **al mismo web-admin**: los dos al servicio de pruebas `gym-app-vitrina` (antes del Deploy 2) o los dos a producción (después). El emisor de eventos vive en la memoria de cada proceso: un panel en un servidor y una vitrina en otro nunca se ven.

## Despliegues y puntos de control

El agente no despliega nada. Hay dos deploys, ambos del usuario:

1. **Deploy 1, al terminar la Task 6** (hecho: `main` en producción con la migración `20261015000000_vitrina` aplicada). **PUNTO DE CONTROL A (superado):** el usuario confirmó la migración y que web-admin, el check-in y Caja funcionan. Sigue el Step 15 de la Task 1 (APK de prueba en la TV real).
2. **Deploy 2, al final del plan: unir la rama `vitrina` con `main`** (Tasks 7 a 14 ya probadas en el servicio de pruebas). **PUNTO DE CONTROL B:** el agente se detiene antes del Step 5 de la Task 14 y espera la confirmación del usuario de que el merge, el push y el deploy de producción están hechos; el workflow del APK compila desde GitHub, no desde el working tree.

Entre el Punto A y el Punto B el trabajo vive en la rama `vitrina` y todas las verificaciones se hacen en la nube: web-admin en el servicio de pruebas `gym-app-vitrina` y la vista previa de la vitrina en el servicio estático `gym-app-vitrina-tv`, ambos de EasyPanel, con la sede y la API key de `zip-gym`. Al terminar (después de la checklist de la Task 14) el usuario elimina los dos servicios de prueba.

**Cuándo se verifica a mano:** cada tarea se implementa en el working tree y el usuario hace push a `vitrina` tras cada una (así el workflow de verificación da tipos, lint y tests de cada tarea). Las comprobaciones manuales se agrupan en dos **puntos de verificación** en los que el agente pide el push y que el servicio esté desplegado, y espera: **V1 tras la Task 10** (API, SSE, dashboard y subidas contra `gym-app-vitrina`; incluye el Step 6 de la Task 8 y el Step 7 de la Task 10) y **V2 tras la Task 13** (vista previa en `gym-app-vitrina-tv`).

## Entorno de pruebas (EasyPanel, lo crea el usuario)

Comparte la base de datos y el bucket R2 de producción: **se trabaja solo en la organización `zip-gym`** y no se crea ni se toca nada de otras organizaciones.

### Servicio `gym-app-vitrina` (web-admin de pruebas)

1. EasyPanel → proyecto de gym-app → **Create Service → App**, nombre `gym-app-vitrina`.
2. **Source → GitHub**: el mismo repositorio, rama `vitrina`.
3. **Build → Dockerfile**: ruta `Dockerfile` (el de la raíz), contexto en la raíz del repo. Sin build args.
4. **Environment**: las mismas variables que el servicio de producción (copiarlas desde allí, sin pegar valores en ningún chat). Son exactamente estas seis, que son todas las que lee el código (`process.env` en `apps/web-admin` y `packages`):

   | Variable | Qué es |
   |---|---|
   | `DATABASE_URL` | cadena de conexión de la base de **producción** (la misma) |
   | `R2_ACCOUNT_ID` | cuenta de Cloudflare R2 |
   | `R2_ACCESS_KEY_ID` | clave de acceso a R2 |
   | `R2_SECRET_ACCESS_KEY` | secreto de R2 |
   | `R2_BUCKET_NAME` | bucket (`gym-app`) |
   | `R2_PUBLIC_URL` | URL pública del bucket |

   `NODE_ENV`, `PORT=3000`, `HOSTNAME` y `TZ=America/Caracas` ya vienen en el Dockerfile.
5. **Domains**: un dominio propio (o el `*.easypanel.host` que asigna EasyPanel) con el **mismo puerto que el servicio de producción** (EasyPanel inyecta `PORT`: el log del arranque muestra `Local: http://localhost:80`, o sea 80, no 3000), HTTPS activo.
6. **Deploy**. Al arrancar corre `prisma migrate deploy` contra producción; como la rama no agrega migraciones es un no-op. Si el log del arranque muestra una migración pendiente distinta de las ya aplicadas, detenerse y avisar.
7. **CORS de R2** (Task 10, Step 6): añadir el dominio de este servicio a `AllowedOrigins`, además del de producción.
8. **Auto deploy**: activarlo para que cada push a `vitrina` reconstruya el servicio.

### Servicio `gym-app-vitrina-tv` (vista previa estática de la vitrina; se crea en la Task 11)

1. **Create Service → App**, nombre `gym-app-vitrina-tv`; fuente GitHub, rama `vitrina`.
2. **Build → Dockerfile**: ruta `apps/vitrina/Dockerfile`, contexto en la raíz del repo.
3. **Environment**: solo `VITRINA_API_URL` = URL de `gym-app-vitrina` sin `/` final (p. ej. `https://gym-app-vitrina.<tu-dominio>`). La clave **no** va en una variable ni en la imagen: se pasa en el navegador con `#clave=<API key de zip-gym>` (el fragmento no llega al servidor).
4. **Domains**: puerto 3000 (el Dockerfile ejecuta `serve -l 3000` y no lee `PORT`), HTTPS.
5. Para ver la vitrina: `https://<dominio-de-gym-app-vitrina-tv>/#clave=<API key de zip-gym>` en el navegador del PC o del celular (a 1920x1080 con DevTools si se quiere).

## Trazabilidad de la revisión (dónde quedó resuelto cada punto)

| # | Punto | Resuelto en |
|---|---|---|
| 1 | Independencia de usuarios (sin `usuarioId`, `@@unique`, `fotoUrl`, validación de rol/sede) | Task 3 (entidad), Task 6 (schema), Task 10 (selector que solo copia el nombre) |
| 2 | Tasa: `obtenerTasaVigenteFresca`, misma forma que `estado`, sin `tasaActualizadaEn`, función pura de `fecha valor vs hoy`, Bs sobre precio vigente | Task 2 (`estadoDeTasa`), Task 4 (`equivalenteBs`), Task 8 (`tasaBcvParaKiosco`), Task 13 (TV) |
| 3 | `formatearBs` movido a `packages/domain/utils` | Task 2 |
| 4 | Excepción al ADR-001 | Task 11 (ADR-002 + regla ESLint + `transpilePackages`) |
| 5 | Sondeo siempre completo; evento tras commit | Task 9 (acciones), Task 12 (hook) |
| 6 | Reloj efectivo + `servidorAhora` | Task 2, Task 4, Task 12, Task 13; verificación en Task 1 y Task 14 |
| 7 | Un video por franja; prueba temprana en TV real | Task 1 (gate), Task 13 |
| 8 | Vista "Secuencia" con subir/bajar | Task 9 |
| 9 | Manifiesto sin vencidos, con futuros | Task 4 |
| 10 | Marca de rotación de video | Task 5 (parser y validador), Task 10 (poster), Task 1/14 (verificación en TV) |
| 11 | `apps/vitrina-tv` propio, kiosco intacto, sin `CapacitorHttp` | Task 1, Task 14 (guarda `git diff`) |
| 12 | `s3-request-presigner`, `Cache-Control`, resolución y tope de imágenes | Task 5 (constantes), Task 7 (R2), Task 10 (compresión) |
| 13 | `avc3`; `migrate diff` con config local y sin drift; migración aditiva; adb off; `file-transfer` | Task 5, Task 6, Task 1/14 (README), Task 1/12. **Nota:** `@capacitor/file-transfer` no tiene serie 8: su última es la 2.0.6 (peer `@capacitor/core >=8`); `@capacitor/filesystem` sí es 8.x. |

**Desviaciones respecto de la spec (a corregir en Task 14):** (a) el workflow no necesita `NEXT_PUBLIC_API_URL`: la URL de la API va en `vitrina-config.json` en tiempo de preparación; (b) el manifiesto excluye también los ítems inactivos (no tiene sentido descargarlos).

## Review Focus

Entradas que la spec implica y ningún camino feliz ejercita; cada una tiene su prueba en la tarea indicada:

1. **Reloj de la TV atrasado tras un corte de luz** (equipos sin pila de reloj marcan 1970 o la fecha del firmware): debe usarse el último `servidorAhora` guardado para `inicio`/`fin` y para el estado de la tasa → Task 2 (`instanteEfectivo`), Task 14 (desenchufar la TV).
2. **Sincronización incompleta** (se cayó la red a mitad de la descarga, o una pieza nueva falla): no se borra nada, no se adopta el manifiesto nuevo y se reintenta; la TV sigue mostrando lo anterior → Task 12 (`sincronizar.test.ts`).
3. **Videos que "parecen" válidos**: HEVC de iPhone, H.264 con marca de rotación de 90°, `moov` al final del archivo, caja de 64 bits, archivo truncado o sin pista de video → Task 5 (`mp4.test.ts`, `videoVitrina.test.ts`).
4. **Cantidades de entrenadores y orden raros**: 0 visibles (pantalla de marca), 1, 5 y 7 entrenadores, una promo en medio de dos entrenadores, un entrenador inactivo entre dos activos, ítems desordenados → Task 3 (`secuenciaVitrina.test.ts`).
5. **Datos de formulario hostiles**: oferta mayor que el precio, números con coma o `abc`, descuento 150 %, fechas invertidas, URL fuera del bucket de la vitrina, video que no llegó a R2 → Task 4 (`vitrinaItem.test.ts`), Task 9 (`esUrlDeVitrina`, `inspeccionar`).

---

### Task 1: Cáscara Android propia, workflow y prueba en la TV real (gate)

Esta tarea va primero a propósito: valida en el equipo físico lo que decide el diseño (3 videos a la vez, arranque en frío sin red, reloj tras un corte de luz y arranque automático) antes de construir la API y la app. Los Steps 1 a 14 se hacen en el working tree; el Step 15 (compilar el APK de prueba y probarlo en el TV) necesita el código en GitHub, así que se ejecuta en el **Punto de control A**, tras el Deploy 1 que hace el usuario, y antes de empezar la Task 7.

**Files:**
- Create: `apps/vitrina-tv/capacitor/` (copia adaptada de `apps/kiosk-tv/capacitor/android/`), `package.json`, `.gitignore`, `scripts/configuracion.mjs`, `scripts/configuracion.test.mjs`, `scripts/preparar.mjs`, `scripts/generar-iconos.mjs`, `assets/escudo.png`, `android/app/src/main/java/com/adrenalina/vitrina/{MainActivity,ArranqueReceiver}.java`
- Create: `apps/vitrina-tv/prueba/index.html`
- Create: `apps/vitrina-tv/README.md`
- Create: `.github/workflows/apk-vitrina.yml`
- Modify (solo los copiados): `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/values/strings.xml`, `.../values/ic_launcher_background.xml`

**Interfaces:**
- Produces: `construirConfiguracion(env): { capacitor: object, vitrina: { apiUrl: string, clave: string } }` (módulo `scripts/configuracion.mjs`); variables de entorno `VITRINA_API_URL`, `VITRINA_CLAVE`, `VITRINA_WEB_DIR` (relativa a `apps/vitrina-tv/capacitor`), `VITRINA_DEV_URL`; workflow `apk-vitrina.yml` con inputs `sucursal`, `api_url`, `modo` (`vitrina` | `prueba`); `appId` `com.adrenalina.vitrina`.
- Consumes: nada de otras tareas.

El proyecto Capacitor va en `apps/vitrina-tv/capacitor/` (un nivel más abajo que `apps/vitrina-tv/`), igual que el kiosco, para que **no** lo recoja el glob `apps/*` de los workspaces de npm.

- [ ] **Step 1: Copiar la plantilla Android del kiosco (solo lectura del original)**

```bash
cd /c/dev/gym-app
DEST=apps/vitrina-tv/capacitor
mkdir -p "$DEST"
git ls-files apps/kiosk-tv/capacitor/android | while read -r f; do
  d="$DEST/${f#apps/kiosk-tv/capacitor/}"
  mkdir -p "$(dirname "$d")"
  cp "$f" "$d"
done
cp apps/kiosk-tv/capacitor/.gitignore "$DEST/.gitignore"
mkdir -p "$DEST/android/app/src/main/java/com/adrenalina/vitrina"
mv "$DEST/android/app/src/main/java/com/adrenalina/kiosco/MainActivity.java" "$DEST/android/app/src/main/java/com/adrenalina/vitrina/MainActivity.java"
rmdir "$DEST/android/app/src/main/java/com/adrenalina/kiosco"
```

- [ ] **Step 2: Renombrar identificadores**

```bash
cd /c/dev/gym-app/apps/vitrina-tv/capacitor/android/app
sed -i 's/com\.adrenalina\.kiosco/com.adrenalina.vitrina/g' build.gradle src/main/java/com/adrenalina/vitrina/MainActivity.java src/main/res/values/strings.xml
sed -i 's/Kiosco AX/Vitrina AX/g' src/main/res/values/strings.xml
grep -rIni "kiosco\|kiosk" ../ --include=*.xml --include=*.gradle --include=*.java --include=*.properties | grep -v "/build/"
```

Expected: el último `grep` no imprime nada.

- [ ] **Step 3: `versionCode` desde el workflow**

En `apps/vitrina-tv/capacitor/android/app/build.gradle` reemplazar `versionCode 1` por:

```gradle
        versionCode (project.findProperty("versionCode") ?: "1").toInteger()
```

- [ ] **Step 4: Receiver de arranque y `MainActivity`**

Crear `apps/vitrina-tv/capacitor/android/app/src/main/java/com/adrenalina/vitrina/ArranqueReceiver.java`:

```java
package com.adrenalina.vitrina;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Abre la vitrina cuando el TV termina de arrancar. Android 10+ restringe abrir actividades desde segundo
// plano: hace falta el permiso "Mostrar sobre otras aplicaciones" (ver apps/vitrina-tv/README.md).
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context contexto, Intent intento) {
        String accion = intento.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(accion) || "android.intent.action.QUICKBOOT_POWERON".equals(accion)) {
            Intent abrir = new Intent(contexto, MainActivity.class);
            abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            contexto.startActivity(abrir);
        }
    }
}
```

En `MainActivity.java` (ya con `package com.adrenalina.vitrina;`) cambiar únicamente el comentario del `onCreate` a `// La vitrina no debe apagar la pantalla ni mostrar barras del sistema.`

- [ ] **Step 5: Manifiesto (reemplazar el contenido completo)**

`apps/vitrina-tv/capacitor/android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />

    <application
        android:allowBackup="false"
        android:banner="@drawable/banner"
        android:usesCleartextTraffic="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:screenOrientation="sensorLandscape"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>

        </activity>

        <receiver
            android:name=".ArranqueReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
            </intent-filter>
        </receiver>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
</manifest>
```

- [ ] **Step 6: `package.json` del proyecto Capacitor**

`apps/vitrina-tv/capacitor/package.json`:

```json
{
  "name": "vitrina-tv-capacitor",
  "private": true,
  "version": "0.1.0",
  "description": "Cáscara Capacitor de Android TV para la vitrina (app empaquetada en el APK, sin URL remota).",
  "scripts": {
    "preparar": "node scripts/preparar.mjs",
    "sync": "node scripts/preparar.mjs && cap sync android",
    "test": "node --test \"scripts/*.test.mjs\"",
    "iconos": "node scripts/generar-iconos.mjs"
  },
  "dependencies": {
    "@capacitor/android": "^8.5.3",
    "@capacitor/core": "^8.5.3",
    "@capacitor/file-transfer": "^2.0.6",
    "@capacitor/filesystem": "^8.1.4"
  },
  "devDependencies": {
    "@capacitor/cli": "^8.5.3"
  }
}
```

```bash
cd /c/dev/gym-app/apps/vitrina-tv/capacitor && npm install && npm install --save-dev sharp
```

Expected: se crea `package-lock.json`; `npm ls @capacitor/core @capacitor/file-transfer @capacitor/filesystem` muestra 8.5.x, 2.0.6 y 8.1.x.

- [ ] **Step 7: Escribir la prueba de `construirConfiguracion` (falla)**

`apps/vitrina-tv/capacitor/scripts/configuracion.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirConfiguracion } from "./configuracion.mjs";

test("sin VITRINA_API_URL ni VITRINA_DEV_URL falla", () => {
  assert.throws(() => construirConfiguracion({}), /VITRINA_API_URL/);
});

test("quita las barras finales de la URL de la API y guarda la clave", () => {
  const { vitrina } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test///", VITRINA_CLAVE: "abc" });
  assert.deepEqual(vitrina, { apiUrl: "https://admin.test", clave: "abc" });
});

test("sin clave la deja vacía", () => {
  const { vitrina } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test" });
  assert.equal(vitrina.clave, "");
});

test("por defecto no hay server.url (la app va empaquetada) y no se depura", () => {
  const { capacitor } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test" });
  assert.equal(capacitor.appId, "com.adrenalina.vitrina");
  assert.equal(capacitor.webDir, "www");
  assert.equal(capacitor.server, undefined);
  assert.equal(capacitor.loggingBehavior, "none");
  assert.equal(capacitor.android.webContentsDebuggingEnabled, false);
  assert.equal(capacitor.android.allowMixedContent, false);
});

test("no activa CapacitorHttp", () => {
  const { capacitor } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test" });
  assert.equal(capacitor.plugins, undefined);
});

test("VITRINA_DEV_URL añade server.url solo para desarrollo", () => {
  const { capacitor } = construirConfiguracion({ VITRINA_DEV_URL: "http://192.168.1.10:3002" });
  assert.deepEqual(capacitor.server, { url: "http://192.168.1.10:3002", cleartext: true });
});
```

Run: `cd apps/vitrina-tv/capacitor && npm test`. Expected: FAIL (`Cannot find module ./configuracion.mjs`).

- [ ] **Step 8: Implementar `configuracion.mjs` y `preparar.mjs`**

`apps/vitrina-tv/capacitor/scripts/configuracion.mjs`:

```js
// De las variables de entorno al contenido de capacitor.config.json y de vitrina-config.json.
// La app web va empaquetada en el APK: sin server.url salvo en desarrollo (VITRINA_DEV_URL).
export function construirConfiguracion(env) {
  const apiUrl = (env.VITRINA_API_URL || "").replace(/\/+$/, "");
  const clave = env.VITRINA_CLAVE || "";
  const devUrl = env.VITRINA_DEV_URL || "";
  if (!devUrl && !apiUrl) throw new Error("Falta VITRINA_API_URL (URL base de web-admin).");

  const capacitor = {
    appId: "com.adrenalina.vitrina",
    appName: "Vitrina AX",
    webDir: "www",
    // El APK es de debug y lleva la clave de la sede en el bundle: sin logs y sin WebView inspeccionable.
    loggingBehavior: "none",
    android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  };
  if (devUrl) capacitor.server = { url: devUrl, cleartext: devUrl.startsWith("http://") };

  return { capacitor, vitrina: { apiUrl, clave } };
}
```

`apps/vitrina-tv/capacitor/scripts/preparar.mjs`:

```js
// Prepara lo que Capacitor necesita (nada de esto se versiona):
//   www/                    → copia del export estático de apps/vitrina (o de apps/vitrina-tv/prueba)
//   www/vitrina-config.json → { apiUrl, clave }
//   capacitor.config.json
// Variables: VITRINA_API_URL, VITRINA_CLAVE (opcional), VITRINA_WEB_DIR (por defecto ../../vitrina/out,
// relativa a esta carpeta) y VITRINA_DEV_URL (solo desarrollo).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { construirConfiguracion } from "./configuracion.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { capacitor, vitrina } = construirConfiguracion(process.env);
const webDir = resolve(raiz, process.env.VITRINA_WEB_DIR || "../../vitrina/out");

rmSync(join(raiz, "www"), { recursive: true, force: true });
mkdirSync(join(raiz, "www"), { recursive: true });

if (existsSync(webDir)) {
  cpSync(webDir, join(raiz, "www"), { recursive: true });
} else if (capacitor.server) {
  writeFileSync(join(raiz, "www", "index.html"), "<!doctype html><title>Vitrina</title>");
} else {
  throw new Error(`No existe la carpeta de la app web: ${webDir}. Compila apps/vitrina primero.`);
}

writeFileSync(join(raiz, "www", "vitrina-config.json"), `${JSON.stringify(vitrina)}\n`);
writeFileSync(join(raiz, "capacitor.config.json"), `${JSON.stringify(capacitor, null, 2)}\n`);

console.log("Preparado. API:", vitrina.apiUrl || "(desarrollo)", "| clave:", vitrina.clave ? "***" : "(sin clave)");
```

Run: `cd apps/vitrina-tv/capacitor && npm test`. Expected: PASS (6 tests).

- [ ] **Step 9: Página de prueba (descartable) para la TV real**

`apps/vitrina-tv/prueba/index.html`:

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prueba de la vitrina</title>
<style>
  html, body { margin: 0; height: 100%; background: #0a0d07; color: #f3f6ec; font-family: Arial, sans-serif; }
  #fila { display: flex; height: 76vh; }
  video { width: 33.333%; height: 100%; object-fit: cover; background: #000; }
  #info { padding: 1vh 2vw; font-size: 2.3vh; line-height: 1.35; white-space: pre; }
  .mal { color: #ff3b4e; font-weight: bold; }
</style>
</head>
<body>
<div id="fila">
  <video id="v1" src="video1.mp4" autoplay muted loop playsinline></video>
  <video id="v2" src="video2.mp4" autoplay muted loop playsinline></video>
  <video id="v3" src="video3.mp4" autoplay muted loop playsinline></video>
</div>
<div id="info"></div>
<script>
  var antes = null;
  try { antes = Number(localStorage.getItem("ultimaHora")); } catch (e) {}
  var arranque = Date.now();
  var caracas = function () {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "medium" }).format(new Date());
  };
  function calidad(id) {
    var v = document.getElementById(id);
    var q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : { droppedVideoFrames: "?", totalVideoFrames: "?" };
    return id + ": t=" + v.currentTime.toFixed(1) + "s, cuadros perdidos " + q.droppedVideoFrames + " / " + q.totalVideoFrames + (v.error ? "  ERROR " + v.error.code : "");
  }
  setInterval(function () {
    var ahora = Date.now();
    try { localStorage.setItem("ultimaHora", String(ahora)); } catch (e) {}
    var atrasado = antes && arranque < antes;
    document.getElementById("info").innerHTML =
      "Hora del TV (UTC): " + new Date(ahora).toISOString() + "\n" +
      "Hora en Caracas:   " + caracas() + "\n" +
      "Internet:          " + (navigator.onLine ? "SI" : "NO") + "\n" +
      "Última hora guardada antes de este arranque: " + (antes ? new Date(antes).toISOString() : "(primer arranque)") + "\n" +
      (atrasado ? '<span class="mal">RELOJ ATRASADO tras reiniciar: la vitrina debe usar el último servidorAhora guardado.</span>\n' : "") +
      calidad("v1") + "\n" + calidad("v2") + "\n" + calidad("v3");
  }, 1000);
</script>
</body>
</html>
```

- [ ] **Step 10: Íconos desde el escudo adjunto**

```bash
cd /c/dev/gym-app/apps/vitrina-tv/capacitor
mkdir -p assets
cp "/c/Users/zipne/AppData/Local/Temp/claude/c--dev-gym-app/b411a575-86f2-4827-82f4-d294b516e678/images/1.png" assets/escudo.png
```

`apps/vitrina-tv/capacitor/scripts/generar-iconos.mjs`:

```js
// Genera los íconos de Android (y los de la app web) desde assets/escudo.png. Se corre a mano
// (`npm run iconos`) y se versiona el resultado; el CI no lo ejecuta.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "assets", "escudo.png");
const res = join(raiz, "android", "app", "src", "main", "res");
const web = join(raiz, "..", "..", "vitrina");
const FONDO = { r: 10, g: 13, b: 7, alpha: 1 }; // #0a0d07
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };

async function lienzo(ancho, alto, escudoFraccion, fondo) {
  const maximo = Math.round(Math.min(ancho, alto) * escudoFraccion);
  const escudo = await sharp(origen).resize(maximo, maximo, { fit: "inside" }).toBuffer();
  return sharp({ create: { width: ancho, height: alto, channels: 4, background: fondo } })
    .composite([{ input: escudo, gravity: "center" }])
    .png();
}

const lanzador = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [densidad, lado] of Object.entries(lanzador)) {
  const carpeta = join(res, `mipmap-${densidad}`);
  mkdirSync(carpeta, { recursive: true });
  await (await lienzo(lado, lado, 0.86, FONDO)).toFile(join(carpeta, "ic_launcher.png"));
  await (await lienzo(lado, lado, 0.86, FONDO)).toFile(join(carpeta, "ic_launcher_round.png"));
  // Adaptativo: lienzo 108dp con el escudo dentro de la zona segura (~61 %).
  const adaptativo = Math.round((lado / 48) * 108);
  await (await lienzo(adaptativo, adaptativo, 0.56, TRANSPARENTE)).toFile(join(carpeta, "ic_launcher_foreground.png"));
}

mkdirSync(join(res, "drawable-xhdpi"), { recursive: true });
await (await lienzo(320, 180, 0.92, FONDO)).toFile(join(res, "drawable-xhdpi", "banner.png"));

writeFileSync(
  join(res, "values", "ic_launcher_background.xml"),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A0D07</color>\n</resources>\n'
);

// Pantallas de arranque (las que trae la plantilla): fondo oscuro con el escudo.
for (const carpeta of readdirSync(res).filter((c) => c.startsWith("drawable"))) {
  const archivo = join(res, carpeta, "splash.png");
  if (!existsSync(archivo) || !statSync(archivo).isFile()) continue;
  const vertical = carpeta.includes("port");
  await (await lienzo(vertical ? 1080 : 1920, vertical ? 1920 : 1080, 0.5, FONDO)).toFile(archivo);
}

// App web: ícono de la pestaña y logo de la pantalla de marca.
if (existsSync(web)) {
  mkdirSync(join(web, "app"), { recursive: true });
  mkdirSync(join(web, "public", "branding"), { recursive: true });
  await (await lienzo(512, 512, 0.9, FONDO)).toFile(join(web, "app", "icon.png"));
  await (await lienzo(180, 180, 0.9, FONDO)).toFile(join(web, "app", "apple-icon.png"));
  await sharp(origen).resize(900, 900, { fit: "inside" }).png().toFile(join(web, "public", "branding", "escudo.png"));
}
console.log("Íconos generados.");
```

Run: `cd apps/vitrina-tv/capacitor && npm run iconos`. Expected: "Íconos generados." (la parte web se omite si `apps/vitrina` aún no existe; se vuelve a correr en Task 11).

- [ ] **Step 11: Workflow**

`.github/workflows/apk-vitrina.yml`:

```yaml
name: Compilar APK de la vitrina

# El repositorio es público: un APK con la clave de la sede dentro SOLO se publica cifrado (7-Zip AES-256).
# Modo "prueba": página de rendimiento para el TV real (3 videos a la vez, reloj, sin red); no lleva clave.
on:
  workflow_dispatch:
    inputs:
      sucursal:
        description: "Nombre corto de la sede (minúsculas, números y _). Su clave es el secreto VITRINA_CLAVE_<SEDE>"
        required: true
        default: principal
      api_url:
        description: "URL base de web-admin, sin / final (la app pide ahí /api/kiosco/vitrina)"
        required: true
      modo:
        description: "vitrina = app real; prueba = página de prueba de rendimiento"
        required: true
        type: choice
        options:
          - vitrina
          - prueba
        default: vitrina

permissions:
  contents: read

jobs:
  apk:
    runs-on: ubuntu-24.04
    env:
      SUCURSAL: ${{ inputs.sucursal }}
      MODO: ${{ inputs.modo }}
      VITRINA_API_URL: ${{ inputs.api_url }}
    steps:
      - name: Validar la sede
        run: |
          if ! [[ "$SUCURSAL" =~ ^[a-z0-9_]+$ ]]; then
            echo "Sede inválida: usa solo minúsculas, números y _"
            exit 1
          fi

      - name: Enmascarar la clave en los logs
        env:
          VITRINA_CLAVE: ${{ secrets[format('VITRINA_CLAVE_{0}', inputs.sucursal)] }}
        run: |
          if [ -n "$VITRINA_CLAVE" ]; then echo "::add-mask::$VITRINA_CLAVE"; fi

      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            package-lock.json
            apps/vitrina-tv/capacitor/package-lock.json

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - name: Instalar el monorepo
        if: inputs.modo == 'vitrina'
        run: npm ci

      - name: Probar el dominio y la app
        if: inputs.modo == 'vitrina'
        run: |
          npm test --workspace packages/domain
          npm test --workspace apps/vitrina

      - name: Compilar la app web (export estático)
        if: inputs.modo == 'vitrina'
        run: npx turbo run build --filter=vitrina

      - name: Generar los videos de prueba
        if: inputs.modo == 'prueba'
        working-directory: apps/vitrina-tv/prueba
        run: |
          for par in "testsrc2:1" "smptebars:2" "rgbtestsrc:3"; do
            fuente="${par%%:*}"; n="${par##*:}"
            ffmpeg -loglevel error -f lavfi -i "${fuente}=size=1080x1920:rate=30" -t 30 \
              -c:v libx264 -profile:v high -pix_fmt yuv420p -b:v 8M "video${n}.mp4"
          done
          ls -l

      - name: Instalar dependencias de Capacitor
        working-directory: apps/vitrina-tv/capacitor
        run: npm ci

      - name: Probar los scripts
        working-directory: apps/vitrina-tv/capacitor
        run: npm test

      - name: Preparar y sincronizar (inyecta la URL y la clave)
        working-directory: apps/vitrina-tv/capacitor
        env:
          VITRINA_CLAVE: ${{ secrets[format('VITRINA_CLAVE_{0}', inputs.sucursal)] }}
          VITRINA_WEB_DIR: ${{ inputs.modo == 'prueba' && '../prueba' || '../../vitrina/out' }}
        run: npm run sync

      - name: Compilar el APK de debug
        working-directory: apps/vitrina-tv/capacitor/android
        run: ./gradlew assembleDebug --no-daemon -PversionCode=${{ github.run_number }}

      - name: Preparar el archivo a publicar
        working-directory: apps/vitrina-tv/capacitor
        env:
          VITRINA_CLAVE: ${{ secrets[format('VITRINA_CLAVE_{0}', inputs.sucursal)] }}
          APK_PASSWORD: ${{ secrets.KIOSCO_APK_PASSWORD }}
        run: |
          mkdir -p salida
          cp android/app/build/outputs/apk/debug/app-debug.apk "salida/vitrina-${SUCURSAL}.apk"
          if [ -n "$VITRINA_CLAVE" ]; then
            if [ -z "$APK_PASSWORD" ]; then
              echo "Falta el secreto KIOSCO_APK_PASSWORD: no se publica un APK con clave sin cifrar."
              exit 1
            fi
            sudo apt-get update
            sudo apt-get install -y -q p7zip-full
            (cd salida && 7z a -t7z -mhe=on -p"$APK_PASSWORD" "vitrina-${SUCURSAL}.7z" "vitrina-${SUCURSAL}.apk" > /dev/null && rm "vitrina-${SUCURSAL}.apk")
            if ls salida/*.apk > /dev/null 2>&1; then
              echo "Quedó un APK sin cifrar en salida/: se aborta."
              exit 1
            fi
          else
            echo "::warning::Sin secreto VITRINA_CLAVE_${SUCURSAL^^}: se publica un APK genérico sin clave (¿error de tipeo en la sede?)"
          fi
          ls -l salida

      - uses: actions/upload-artifact@v4
        with:
          name: vitrina-${{ inputs.sucursal }}
          path: apps/vitrina-tv/capacitor/salida/*
          retention-days: 7
          if-no-files-found: error
```

- [ ] **Step 12: Regenerar los gradle de los plugins**

```bash
cd /c/dev/gym-app/apps/vitrina-tv/capacitor
VITRINA_WEB_DIR=../prueba VITRINA_API_URL=https://example.invalid npm run sync
```

Expected: `cap sync` termina sin error y `android/capacitor.settings.gradle` / `android/app/capacitor.build.gradle` ahora incluyen `capacitor-filesystem` y `capacitor-file-transfer`. (Los videos de prueba no existen en local: la página de prueba solo se ejercita en el workflow.)

- [ ] **Step 13: README mínimo del APK**

`apps/vitrina-tv/README.md`: secciones **1. Qué es** (APK Capacitor 8, `appId` `com.adrenalina.vitrina`, nombre "Vitrina AX", app empaquetada, no usa `server.url`), **2. Requisitos del TV** (Android TV oficial, Android System WebView ≥ 111), **3. Compilar** (Actions → "Compilar APK de la vitrina"; secretos `VITRINA_CLAVE_<SEDE>` y `KIOSCO_APK_PASSWORD`; descomprimir `.zip` y `.7z`), **4. Instalar** (USB o `adb connect <ip>` + `adb install -r vitrina-<sede>.apk`), **5. Arranque automático**:

```text
adb shell appops set com.adrenalina.vitrina SYSTEM_ALERT_WINDOW allow
adb shell appops set com.adrenalina.vitrina RUN_IN_BACKGROUND allow
adb shell dumpsys deviceidle whitelist +com.adrenalina.vitrina
adb shell appops get com.adrenalina.vitrina SYSTEM_ALERT_WINDOW
```

y **6. Al terminar**: desactivar la depuración USB/por red en Opciones de desarrollador y ejecutar `adb disconnect` (el APK es de debug y lleva la clave de la sede); **7. Rotar clave** (actualizar el secreto, recompilar, `adb install -r`).

- [ ] **Step 14: Guarda de no regresión y sugerir el commit**

```bash
cd /c/dev/gym-app
git diff --stat -- apps/kiosk-tv .github/workflows/apk-kiosco.yml
```

Expected: sin salida (el kiosco no cambió).

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega la cáscara Android de la vitrina, su workflow y una página de prueba para el TV
```

Nota para quien haga el commit: después del `git add`, ejecutar `git update-index --chmod=+x apps/vitrina-tv/capacitor/android/gradlew` para conservar el bit ejecutable del wrapper de Gradle.

- [ ] **Step 15: Compilar la prueba y verificarla en el TV real (gate manual; se ejecuta en el Punto de control A)**

**No ejecutar este paso ahora.** El workflow compila desde GitHub, así que necesita el código ya subido: se hace después del Deploy 1 (final de la Task 6) y de la confirmación del usuario (ver "Despliegues y puntos de control"). La prueba no usa la API ni la base de datos: la página de prueba va dentro del APK.

```bash
gh workflow run apk-vitrina.yml --ref vitrina -f sucursal=prueba -f api_url=https://example.invalid -f modo=prueba
gh run watch
gh run download --name vitrina-prueba --dir salida-prueba
```

Instalar `salida-prueba/vitrina-prueba.apk` (`adb install -r`), conceder los permisos del README y comprobar, anotando cada resultado:

1. **3 videos a la vez:** los 3 se mueven a 30 fps; "cuadros perdidos" crece despacio. Si no rinden: queda confirmado el diseño de **un video activo por franja** (Task 13) y el póster en los demás; si rinden bien, igual se mantiene la regla (es más seguro).
2. **Arranque en frío sin red:** quitar el internet del TV, cerrar la app, abrirla: carga la página (viene dentro del APK) y los videos corren, con "Internet: NO".
3. **Reloj tras corte de luz:** con la app abierta unos segundos, **desenchufar el TV**, esperar 10 s, enchufarlo **sin internet** y abrir la app: si aparece "RELOJ ATRASADO", el equipo pierde la hora y el reloj efectivo (Task 2) es imprescindible; anotar a qué fecha vuelve.
4. **Arranque automático:** con los permisos concedidos por adb, apagar y encender el TV: la app abre sola. Si no abre: probar fijarla como launcher; si tampoco, documentar el ajuste de "autoinicio" del fabricante en el README.

Guardar los resultados en `docs/superpowers/plans/2026-10-15-vitrina-tv-resultados-prueba.md` (una línea por prueba: resultado y modelo del TV) y sugerir el commit:

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
registra los resultados de la prueba de la vitrina en el TV real
```

Si la prueba 3 o la 4 fallan de forma que invalide el diseño, **detenerse y avisar** antes de la Task 7.

---

### Task 2: Dominio, utilidades de tasa, Bs, reloj y días de Caracas

**Files:**
- Create: `packages/domain/utils/estadoTasa.ts`, `packages/domain/utils/estadoTasa.test.ts`
- Create: `packages/domain/utils/formatearBs.ts`, `packages/domain/utils/formatearBs.test.ts`
- Create: `packages/domain/utils/relojEfectivo.ts`, `packages/domain/utils/relojEfectivo.test.ts`
- Modify: `packages/domain/utils/fechaCaracas.ts`, `packages/domain/utils/fechaCaracas.test.ts`
- Modify: `packages/domain/use-cases/ObtenerTasaVigente.ts`
- Modify: `apps/web-admin/app/(panel)/tasaBcvFija.ts`

**Interfaces:**
- Produces: `estadoDeTasa(fechaTasa: Date, hoy: Date): EstadoTasa` y `type EstadoTasa = "AL_DIA" | "DESACTUALIZADA"` (`utils/estadoTasa`); `formatearBs(monto: number): string` (`utils/formatearBs`); `instanteEfectivo(relojTv: Date, servidorAhoraGuardado: Date | null): Date` (`utils/relojEfectivo`); `rangoDiaCaracas(fechaIso: string): { inicio: Date; fin: Date }` (`utils/fechaCaracas`).
- `ObtenerTasaVigente.ts` sigue exportando `EstadoTasa` (re-export) para no romper importadores.

- [ ] **Step 1: Pruebas que fallan**

`packages/domain/utils/estadoTasa.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { estadoDeTasa } from "./estadoTasa";

const hoy = new Date("2026-10-15T00:00:00Z");

describe("estadoDeTasa", () => {
  test("la tasa de hoy está al día", () => {
    expect(estadoDeTasa(new Date("2026-10-15T00:00:00Z"), hoy)).toBe("AL_DIA");
  });
  test("una tasa publicada para mañana también está al día", () => {
    expect(estadoDeTasa(new Date("2026-10-16T00:00:00Z"), hoy)).toBe("AL_DIA");
  });
  test("la de ayer está desactualizada", () => {
    expect(estadoDeTasa(new Date("2026-10-14T00:00:00Z"), hoy)).toBe("DESACTUALIZADA");
  });
});
```

`packages/domain/utils/formatearBs.test.ts`:

```ts
import { expect, test } from "vitest";
import { formatearBs } from "./formatearBs";

test("usa coma decimal y siempre dos decimales", () => {
  expect(formatearBs(850)).toBe("850,00");
});

test("agrupa los miles con punto", () => {
  expect(formatearBs(12345.6)).toBe("12.345,60");
});
```

`packages/domain/utils/relojEfectivo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { instanteEfectivo } from "./relojEfectivo";

const guardado = new Date("2026-10-15T16:00:00Z");

describe("instanteEfectivo", () => {
  test("sin hora guardada usa el reloj del TV", () => {
    const tv = new Date("2026-10-15T10:00:00Z");
    expect(instanteEfectivo(tv, null)).toBe(tv);
  });
  test("si el reloj del TV está adelantado al guardado, usa el del TV", () => {
    const tv = new Date("2026-10-15T17:00:00Z");
    expect(instanteEfectivo(tv, guardado)).toBe(tv);
  });
  test("tras un corte de luz el reloj retrocede (1970): usa la hora guardada", () => {
    expect(instanteEfectivo(new Date("1970-01-01T00:00:05Z"), guardado)).toBe(guardado);
  });
  test("reloj del TV inválido: usa la hora guardada", () => {
    expect(instanteEfectivo(new Date("no es fecha"), guardado)).toBe(guardado);
  });
  test("hora guardada inválida: usa el reloj del TV", () => {
    const tv = new Date("2026-10-15T10:00:00Z");
    expect(instanteEfectivo(tv, new Date("x"))).toBe(tv);
  });
});
```

Añadir al final de `packages/domain/utils/fechaCaracas.test.ts` (y `rangoDiaCaracas` al import existente de `./fechaCaracas`):

```ts
describe("rangoDiaCaracas", () => {
  test("va de las 00:00 a las 23:59:59.999 de Caracas (UTC-4)", () => {
    const { inicio, fin } = rangoDiaCaracas("2026-10-20");
    expect(inicio.toISOString()).toBe("2026-10-20T04:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-10-21T03:59:59.999Z");
  });
});
```

Run: `npm test --workspace packages/domain -- utils/estadoTasa utils/formatearBs utils/relojEfectivo utils/fechaCaracas`. Expected: FAIL (módulos y `rangoDiaCaracas` no existen).

- [ ] **Step 2: Implementar**

`packages/domain/utils/estadoTasa.ts`:

```ts
// AL_DIA: la última tasa guardada tiene fecha valor >= hoy. DESACTUALIZADA: fecha valor < hoy (casi seguro
// hay una publicación posterior sin sincronizar). Criterio del negocio (2026-09-26); lo comparten
// ObtenerTasaVigente y la vitrina para decidir si muestra el equivalente en Bs.
export type EstadoTasa = "AL_DIA" | "DESACTUALIZADA";

export function estadoDeTasa(fechaTasa: Date, hoy: Date): EstadoTasa {
  return fechaTasa < hoy ? "DESACTUALIZADA" : "AL_DIA";
}
```

`packages/domain/utils/formatearBs.ts`:

```ts
export function formatearBs(monto: number): string {
  return monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

`packages/domain/utils/relojEfectivo.ts`:

```ts
// Hora que la TV usa para decidir qué mostrar. Algunos equipos pierden la hora al desenchufarse; el servidor
// manda su hora con cada manifiesto y la TV guarda la última, así el reloj nunca retrocede de ella.
export function instanteEfectivo(relojTv: Date, servidorAhoraGuardado: Date | null): Date {
  const guardadoValido = servidorAhoraGuardado !== null && !Number.isNaN(servidorAhoraGuardado.getTime());
  if (Number.isNaN(relojTv.getTime())) return guardadoValido ? servidorAhoraGuardado : relojTv;
  if (!guardadoValido) return relojTv;
  return relojTv.getTime() >= servidorAhoraGuardado.getTime() ? relojTv : servidorAhoraGuardado;
}
```

En `packages/domain/utils/fechaCaracas.ts`, justo después de `inicioDelDiaCaracas`:

```ts
// "2026-10-20" → de las 00:00 a las 23:59:59.999 de ese día en Caracas (UTC-4, sin horario de verano).
export function rangoDiaCaracas(fechaIso: string): { inicio: Date; fin: Date } {
  const inicio = inicioDelDiaCaracas(new Date(`${fechaIso}T12:00:00Z`));
  return { inicio, fin: new Date(inicio.getTime() + 86_400_000 - 1) };
}
```

En `packages/domain/use-cases/ObtenerTasaVigente.ts`: sustituir el bloque

```ts
export type EstadoTasa = "AL_DIA" | "DESACTUALIZADA";
```

por

```ts
import { estadoDeTasa, type EstadoTasa } from "../utils/estadoTasa";
export type { EstadoTasa };
```

(el `import` va junto a los otros imports del archivo) y `estado: ultima.fecha < hoy ? "DESACTUALIZADA" : "AL_DIA"` por `estado: estadoDeTasa(ultima.fecha, hoy)`.

En `apps/web-admin/app/(panel)/tasaBcvFija.ts` reemplazar la función `formatearBs` por la importación y su re-exportación (los ~14 importadores actuales siguen funcionando, pero ya no hay copia):

```ts
import { formatearBs } from "@gym-app/domain/utils/formatearBs";
export { formatearBs };
```

(`formatearBsConRef` sigue usándola igual.)

- [ ] **Step 3: Ejecutar**

Run: `npm test --workspace packages/domain`. Expected: todo en verde (incluidos los tests existentes de `ObtenerTasaVigente`).
Tipos: Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

- [ ] **Step 4: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega estadoDeTasa, reloj efectivo y rango de día de Caracas y mueve formatearBs al dominio
```

---

### Task 3: Dominio, entidad de la vitrina y secuencia de diapositivas

**Files:**
- Create: `packages/domain/entities/Vitrina.ts`, `packages/domain/entities/vitrinaItemDePrueba.ts`
- Create: `packages/domain/services/secuenciaVitrina.ts`, `packages/domain/services/secuenciaVitrina.test.ts`

**Interfaces:**
- Produces (`entities/Vitrina`): `TIPOS_VITRINA`, `TipoVitrinaItem`, `TipoMedio`, `TRANSICIONES_VITRINA`, `TransicionVitrina`, `VitrinaItem`, `DatosVitrinaItem`, `CambiosVitrinaItem`, `AjustesVitrina`, `ItemManifiesto`, `ManifiestoVitrina`.
- Produces (`services/secuenciaVitrina`): `MAX_ENTRENADORES_POR_FRANJA = 3`, `Diapositiva`, `estaVencido(item, ahora)`, `estaVisible(item, ahora)`, `estadoVisibilidad(item, ahora): "INACTIVO" | "VENCIDO" | "PROGRAMADO" | "EN_PANTALLA"`, `repartirFranjas(n)`, `construirSecuencia(items, ahora, duracionPorDefectoSeg)`, `numeroDeDiapositiva(secuencia): Map<string, number>`.
- Produces (`entities/vitrinaItemDePrueba`): `itemDePrueba(parcial?: Partial<VitrinaItem>): VitrinaItem` (solo para tests).

- [ ] **Step 1: Entidad**

`packages/domain/entities/Vitrina.ts`:

```ts
export const TIPOS_VITRINA = ["ENTRENADOR", "PROMO", "PRODUCTO"] as const;
export type TipoVitrinaItem = (typeof TIPOS_VITRINA)[number];
export type TipoMedio = "IMAGEN" | "VIDEO";
export const TRANSICIONES_VITRINA = ["FUNDIDO", "DESLIZAR"] as const;
export type TransicionVitrina = (typeof TRANSICIONES_VITRINA)[number];

// Un ítem de la secuencia de la TV. La vitrina es independiente del módulo de usuarios: el entrenador guarda su
// propio nombre y su propio medio vertical, sin vínculo con UsuarioAdmin.
export interface VitrinaItem {
  id: string;
  sucursalId: string;
  tipo: TipoVitrinaItem;
  orden: number;
  activo: boolean;
  duracionSeg: number | null; // null = la de la sede
  inicio: Date | null;
  fin: Date | null;
  mediaUrl: string;
  mediaTipo: TipoMedio;
  posterUrl: string | null;
  // Badges (PROMO y PRODUCTO)
  precioUSD: number | null;
  ofertaUSD: number | null;
  descuentoPct: number | null;
  etiqueta: string | null;
  mostrarPrecio: boolean;
  mostrarOferta: boolean;
  mostrarDescuento: boolean;
  mostrarEtiqueta: boolean;
  mostrarEquivalenteBs: boolean;
  // Entrenador (nombre también identifica a las promos y productos en el panel)
  nombre: string | null;
  especialidad: string | null;
  frase: string | null;
  mostrarMedio: boolean;
  mostrarNombre: boolean;
  mostrarEspecialidad: boolean;
  mostrarFrase: boolean;
}

export type DatosVitrinaItem = Omit<VitrinaItem, "id" | "sucursalId" | "orden" | "activo">;
export type CambiosVitrinaItem = Partial<DatosVitrinaItem> & { activo?: boolean };

export interface AjustesVitrina {
  duracionSeg: number;
  transicion: TransicionVitrina;
  version: number;
}

// Lo que viaja por GET /api/kiosco/vitrina: las fechas van en ISO.
export interface ItemManifiesto extends Omit<VitrinaItem, "inicio" | "fin"> {
  inicio: string | null;
  fin: string | null;
}

export interface ManifiestoVitrina {
  version: number;
  servidorAhora: string; // hora del servidor (ISO): la TV guarda la última para su reloj efectivo
  duracionSeg: number;
  transicion: TransicionVitrina;
  tasaBcv: { valor: number; fecha: string } | null; // misma forma que /api/kiosco/estado
  items: ItemManifiesto[];
}
```

`packages/domain/entities/vitrinaItemDePrueba.ts`:

```ts
import type { VitrinaItem } from "./Vitrina";

let contador = 0;

// Solo para tests: un ítem válido con valores neutros que cada prueba sobrescribe.
export function itemDePrueba(parcial: Partial<VitrinaItem> = {}): VitrinaItem {
  contador += 1;
  return {
    id: `item-${contador}`,
    sucursalId: "suc-1",
    tipo: "PROMO",
    orden: contador,
    activo: true,
    duracionSeg: null,
    inicio: null,
    fin: null,
    mediaUrl: `https://r2.test/vitrina/${contador}.webp`,
    mediaTipo: "IMAGEN",
    posterUrl: null,
    precioUSD: null,
    ofertaUSD: null,
    descuentoPct: null,
    etiqueta: null,
    mostrarPrecio: true,
    mostrarOferta: true,
    mostrarDescuento: true,
    mostrarEtiqueta: true,
    mostrarEquivalenteBs: true,
    nombre: null,
    especialidad: null,
    frase: null,
    mostrarMedio: true,
    mostrarNombre: true,
    mostrarEspecialidad: true,
    mostrarFrase: true,
    ...parcial,
  };
}
```

- [ ] **Step 2: Pruebas que fallan**

`packages/domain/services/secuenciaVitrina.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import type { VitrinaItem } from "../entities/Vitrina";
import {
  construirSecuencia,
  estaVencido,
  estaVisible,
  estadoVisibilidad,
  numeroDeDiapositiva,
  repartirFranjas,
  type Diapositiva,
} from "./secuenciaVitrina";

const AHORA = new Date("2026-10-15T16:00:00Z");
const ent = (id: string, orden: number, extra: Partial<VitrinaItem> = {}) =>
  itemDePrueba({ id, orden, tipo: "ENTRENADOR", nombre: id, ...extra });
const promo = (id: string, orden: number, extra: Partial<VitrinaItem> = {}) =>
  itemDePrueba({ id, orden, tipo: "PROMO", ...extra });
const claves = (secuencia: Diapositiva[]) =>
  secuencia.map((d) => (d.tipo === "FRANJA" ? d.entrenadores.map((e) => e.id).join("+") : d.item.id));

describe("repartirFranjas", () => {
  test.each([
    [0, []],
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [3, 2]],
    [6, [3, 3]],
    [7, [3, 2, 2]],
    [8, [3, 3, 2]],
    [10, [3, 3, 2, 2]],
  ])("%i entrenadores → %j", (n, esperado) => {
    expect(repartirFranjas(n)).toEqual(esperado);
  });

  test("nunca deja una franja de 1 si hay más de un entrenador", () => {
    for (let n = 2; n <= 30; n++) expect(Math.min(...repartirFranjas(n))).toBeGreaterThanOrEqual(2);
  });
});

describe("visibilidad", () => {
  test("un ítem inactivo no se ve", () => {
    expect(estaVisible(promo("a", 1, { activo: false }), AHORA)).toBe(false);
  });
  test("un ítem futuro no se ve todavía", () => {
    expect(estaVisible(promo("a", 1, { inicio: new Date("2026-10-16T04:00:00Z") }), AHORA)).toBe(false);
  });
  test("un ítem vencido no se ve", () => {
    const vencido = promo("a", 1, { fin: new Date("2026-10-15T15:59:59.999Z") });
    expect(estaVencido(vencido, AHORA)).toBe(true);
    expect(estaVisible(vencido, AHORA)).toBe(false);
  });
  test("con fin en el mismo instante todavía se ve", () => {
    expect(estaVisible(promo("a", 1, { fin: AHORA }), AHORA)).toBe(true);
  });
  test("estadoVisibilidad distingue los cuatro casos", () => {
    expect(estadoVisibilidad(promo("a", 1, { activo: false }), AHORA)).toBe("INACTIVO");
    expect(estadoVisibilidad(promo("a", 1, { fin: new Date("2026-10-01T00:00:00Z") }), AHORA)).toBe("VENCIDO");
    expect(estadoVisibilidad(promo("a", 1, { inicio: new Date("2026-11-01T00:00:00Z") }), AHORA)).toBe("PROGRAMADO");
    expect(estadoVisibilidad(promo("a", 1), AHORA)).toBe("EN_PANTALLA");
  });
});

describe("construirSecuencia", () => {
  test("sin ítems visibles devuelve una lista vacía", () => {
    expect(construirSecuencia([promo("a", 1, { activo: false })], AHORA, 12)).toEqual([]);
    expect(construirSecuencia([], AHORA, 12)).toEqual([]);
  });

  test("ordena por orden aunque lleguen desordenados", () => {
    const s = construirSecuencia([promo("c", 3), promo("a", 1), promo("b", 2)], AHORA, 12);
    expect(claves(s)).toEqual(["a", "b", "c"]);
  });

  test("5 entrenadores consecutivos se reparten 3+2", () => {
    const items = [1, 2, 3, 4, 5].map((n) => ent(`e${n}`, n));
    expect(claves(construirSecuencia(items, AHORA, 12))).toEqual(["e1+e2+e3", "e4+e5"]);
  });

  test("7 entrenadores se reparten 3+2+2", () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ent(`e${n}`, n));
    expect(claves(construirSecuencia(items, AHORA, 12))).toEqual(["e1+e2+e3", "e4+e5", "e6+e7"]);
  });

  test("una promo entre dos entrenadores corta el grupo", () => {
    const s = construirSecuencia([ent("a", 1), promo("p", 2), ent("b", 3)], AHORA, 12);
    expect(claves(s)).toEqual(["a", "p", "b"]);
  });

  test("un entrenador inactivo entre dos activos no corta el grupo", () => {
    const s = construirSecuencia([ent("a", 1), ent("x", 2, { activo: false }), ent("b", 3)], AHORA, 12);
    expect(claves(s)).toEqual(["a+b"]);
  });

  test("la duración de un cartel es la suya o la de la sede", () => {
    const s = construirSecuencia([promo("a", 1, { duracionSeg: 20 }), promo("b", 2)], AHORA, 12);
    expect(s.map((d) => d.duracionSeg)).toEqual([20, 12]);
  });

  test("la duración de una franja es la de su primer entrenador, o la de la sede", () => {
    expect(construirSecuencia([ent("a", 1, { duracionSeg: 30 }), ent("b", 2)], AHORA, 12)[0].duracionSeg).toBe(30);
    expect(construirSecuencia([ent("a", 1), ent("b", 2, { duracionSeg: 30 })], AHORA, 12)[0].duracionSeg).toBe(12);
  });

  test("la clave de cada diapositiva es estable y única", () => {
    const s = construirSecuencia([ent("a", 1), promo("p", 2), ent("b", 3)], AHORA, 12);
    expect(new Set(s.map((d) => d.clave)).size).toBe(3);
    expect(construirSecuencia([ent("a", 1), promo("p", 2), ent("b", 3)], AHORA, 12).map((d) => d.clave)).toEqual(
      s.map((d) => d.clave)
    );
  });
});

describe("numeroDeDiapositiva", () => {
  test("numera cada ítem visible, los entrenadores de una franja comparten número", () => {
    const s = construirSecuencia([ent("a", 1), ent("b", 2), promo("p", 3)], AHORA, 12);
    const numeros = numeroDeDiapositiva(s);
    expect(numeros.get("a")).toBe(1);
    expect(numeros.get("b")).toBe(1);
    expect(numeros.get("p")).toBe(2);
  });
});
```

Run: `npm test --workspace packages/domain -- services/secuenciaVitrina`. Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`packages/domain/services/secuenciaVitrina.ts`:

```ts
import type { VitrinaItem } from "../entities/Vitrina";

export const MAX_ENTRENADORES_POR_FRANJA = 3;

export type Diapositiva =
  | { clave: string; tipo: "CARTEL"; item: VitrinaItem; duracionSeg: number }
  | { clave: string; tipo: "FRANJA"; entrenadores: VitrinaItem[]; duracionSeg: number };

export function estaVencido(item: VitrinaItem, ahora: Date): boolean {
  return item.fin !== null && item.fin.getTime() < ahora.getTime();
}

export function estaVisible(item: VitrinaItem, ahora: Date): boolean {
  if (!item.activo || estaVencido(item, ahora)) return false;
  return item.inicio === null || item.inicio.getTime() <= ahora.getTime();
}

export type EstadoVisibilidad = "INACTIVO" | "VENCIDO" | "PROGRAMADO" | "EN_PANTALLA";

export function estadoVisibilidad(item: VitrinaItem, ahora: Date): EstadoVisibilidad {
  if (!item.activo) return "INACTIVO";
  if (estaVencido(item, ahora)) return "VENCIDO";
  if (item.inicio !== null && item.inicio.getTime() > ahora.getTime()) return "PROGRAMADO";
  return "EN_PANTALLA";
}

// n entrenadores → ceil(n/3) franjas lo más parejas posible, las mayores primero. Nunca una franja de 1
// salvo que n = 1: 4→2+2, 5→3+2, 7→3+2+2.
export function repartirFranjas(n: number): number[] {
  if (n <= 0) return [];
  const franjas = Math.ceil(n / MAX_ENTRENADORES_POR_FRANJA);
  const base = Math.floor(n / franjas);
  const resto = n % franjas;
  return Array.from({ length: franjas }, (_, i) => base + (i < resto ? 1 : 0));
}

// La secuencia que muestra la TV en `ahora`. Los entrenadores que quedan consecutivos tras descartar los no
// visibles se agrupan en franjas; un cartel de promo o producto entre dos de ellos corta el grupo.
export function construirSecuencia(items: VitrinaItem[], ahora: Date, duracionPorDefectoSeg: number): Diapositiva[] {
  const visibles = items
    .filter((item) => estaVisible(item, ahora))
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

  const secuencia: Diapositiva[] = [];
  let i = 0;
  while (i < visibles.length) {
    const item = visibles[i];
    if (item.tipo !== "ENTRENADOR") {
      secuencia.push({ clave: item.id, tipo: "CARTEL", item, duracionSeg: item.duracionSeg ?? duracionPorDefectoSeg });
      i += 1;
      continue;
    }
    let fin = i;
    while (fin < visibles.length && visibles[fin].tipo === "ENTRENADOR") fin += 1;
    const grupo = visibles.slice(i, fin);
    let desde = 0;
    for (const tamano of repartirFranjas(grupo.length)) {
      const entrenadores = grupo.slice(desde, desde + tamano);
      desde += tamano;
      secuencia.push({
        clave: `franja:${entrenadores.map((e) => e.id).join("+")}`,
        tipo: "FRANJA",
        entrenadores,
        duracionSeg: entrenadores[0].duracionSeg ?? duracionPorDefectoSeg,
      });
    }
    i = fin;
  }
  return secuencia;
}

// id del ítem → número (1, 2, 3…) de la diapositiva en que sale; el panel lo muestra en la vista "Secuencia".
export function numeroDeDiapositiva(secuencia: Diapositiva[]): Map<string, number> {
  const numeros = new Map<string, number>();
  secuencia.forEach((diapositiva, indice) => {
    const items = diapositiva.tipo === "CARTEL" ? [diapositiva.item] : diapositiva.entrenadores;
    for (const item of items) numeros.set(item.id, indice + 1);
  });
  return numeros;
}
```

- [ ] **Step 4: Ejecutar**

Run: `npm test --workspace packages/domain -- services/secuenciaVitrina`. Expected: PASS.

- [ ] **Step 5: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega la entidad de la vitrina y la secuencia de diapositivas con franjas de 3 entrenadores
```

---

### Task 4: Dominio, badges, validación de ítems y manifiesto

**Files:**
- Create: `packages/domain/utils/vitrinaBadges.ts`, `packages/domain/utils/vitrinaBadges.test.ts`
- Create: `packages/domain/utils/vitrinaItem.ts`, `packages/domain/utils/vitrinaItem.test.ts`
- Create: `packages/domain/services/manifiestoVitrina.ts`, `packages/domain/services/manifiestoVitrina.test.ts`

**Interfaces:**
- Consumes: `VitrinaItem`, `DatosVitrinaItem`, `AjustesVitrina`, `ManifiestoVitrina`, `ItemManifiesto` (Task 3); `EstadoTasa` (Task 2); `estaVencido` (Task 3).
- Produces: `precioVigenteUSD(item): number | null`, `descuentoMostrado(item): number | null`, `equivalenteBs(item, tasa: { valor: number; estado: EstadoTasa } | null): number | null` (`utils/vitrinaBadges`); `DURACION_MIN_SEG = 3`, `DURACION_MAX_SEG = 300`, `validarVitrinaItem(datos: DatosVitrinaItem): string | null`, `numeroOpcional(valor: unknown): number | null` (`utils/vitrinaItem`); `armarManifiesto(e: { items: VitrinaItem[]; ajustes: AjustesVitrina; tasaBcv: { valor: number; fecha: string } | null; ahora: Date }): ManifiestoVitrina`, `itemsDeManifiesto(m): VitrinaItem[]`, `urlsDeManifiesto(m): string[]` (`services/manifiestoVitrina`).

- [ ] **Step 1: Pruebas que fallan**

`packages/domain/utils/vitrinaBadges.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import { descuentoMostrado, equivalenteBs, precioVigenteUSD } from "./vitrinaBadges";

describe("precioVigenteUSD", () => {
  test("la oferta activa manda", () => {
    expect(precioVigenteUSD(itemDePrueba({ precioUSD: 20, ofertaUSD: 15 }))).toBe(15);
  });
  test("con la oferta apagada se usa el precio", () => {
    expect(precioVigenteUSD(itemDePrueba({ precioUSD: 20, ofertaUSD: 15, mostrarOferta: false }))).toBe(20);
  });
  test("sin oferta se usa el precio", () => {
    expect(precioVigenteUSD(itemDePrueba({ precioUSD: 20 }))).toBe(20);
  });
  test("con el precio oculto y sin oferta no hay precio vigente (no se filtra el monto)", () => {
    expect(precioVigenteUSD(itemDePrueba({ precioUSD: 20, mostrarPrecio: false }))).toBeNull();
  });
  test("sin ningún monto no hay precio vigente", () => {
    expect(precioVigenteUSD(itemDePrueba())).toBeNull();
  });
});

describe("descuentoMostrado", () => {
  test("usa el manual si existe", () => {
    expect(descuentoMostrado(itemDePrueba({ descuentoPct: 30, precioUSD: 20, ofertaUSD: 15 }))).toBe(30);
  });
  test("si no, lo calcula de precio y oferta", () => {
    expect(descuentoMostrado(itemDePrueba({ precioUSD: 20, ofertaUSD: 15 }))).toBe(25);
  });
  test("apagado no se muestra", () => {
    expect(descuentoMostrado(itemDePrueba({ descuentoPct: 30, mostrarDescuento: false }))).toBeNull();
  });
  test("sin datos o con oferta igual al precio no hay descuento", () => {
    expect(descuentoMostrado(itemDePrueba())).toBeNull();
    expect(descuentoMostrado(itemDePrueba({ precioUSD: 20, ofertaUSD: 20 }))).toBeNull();
  });
});

describe("equivalenteBs", () => {
  const alDia = { valor: 40, estado: "AL_DIA" as const };
  test("se calcula sobre el precio vigente", () => {
    expect(equivalenteBs(itemDePrueba({ precioUSD: 20, ofertaUSD: 12.5 }), alDia)).toBe(500);
    expect(equivalenteBs(itemDePrueba({ precioUSD: 20 }), alDia)).toBe(800);
  });
  test("redondea a dos decimales", () => {
    expect(equivalenteBs(itemDePrueba({ precioUSD: 3.33 }), { valor: 36.1234, estado: "AL_DIA" })).toBe(120.29);
  });
  test("tasa desactualizada: se oculta", () => {
    expect(equivalenteBs(itemDePrueba({ precioUSD: 20 }), { valor: 40, estado: "DESACTUALIZADA" })).toBeNull();
  });
  test("sin tasa: se oculta", () => {
    expect(equivalenteBs(itemDePrueba({ precioUSD: 20 }), null)).toBeNull();
  });
  test("con la bandera apagada: se oculta", () => {
    expect(equivalenteBs(itemDePrueba({ precioUSD: 20, mostrarEquivalenteBs: false }), alDia)).toBeNull();
  });
  test("sin precio vigente: se oculta", () => {
    expect(equivalenteBs(itemDePrueba(), alDia)).toBeNull();
  });
});
```

`packages/domain/utils/vitrinaItem.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import type { DatosVitrinaItem } from "../entities/Vitrina";
import { numeroOpcional, validarVitrinaItem } from "./vitrinaItem";

function datos(parcial: Partial<DatosVitrinaItem> = {}): DatosVitrinaItem {
  const { id: _id, sucursalId: _s, orden: _o, activo: _a, ...resto } = itemDePrueba();
  return { ...resto, ...parcial };
}

describe("numeroOpcional", () => {
  test("vacío, nulo o indefinido → null", () => {
    expect(numeroOpcional("")).toBeNull();
    expect(numeroOpcional("  ")).toBeNull();
    expect(numeroOpcional(null)).toBeNull();
    expect(numeroOpcional(undefined)).toBeNull();
  });
  test("acepta coma decimal", () => {
    expect(numeroOpcional("12,5")).toBe(12.5);
    expect(numeroOpcional("7")).toBe(7);
  });
  test("texto no numérico → NaN (lo rechaza la validación)", () => {
    expect(Number.isNaN(numeroOpcional("abc"))).toBe(true);
  });
});

describe("validarVitrinaItem", () => {
  test("un cartel válido pasa", () => {
    expect(validarVitrinaItem(datos({ precioUSD: 20, ofertaUSD: 15, descuentoPct: 25 }))).toBeNull();
  });
  test("exige el medio", () => {
    expect(validarVitrinaItem(datos({ mediaUrl: "  " }))).toMatch(/imagen o el video/);
  });
  test("el entrenador exige nombre", () => {
    expect(validarVitrinaItem(datos({ tipo: "ENTRENADOR", nombre: "  " }))).toMatch(/nombre/);
    expect(validarVitrinaItem(datos({ tipo: "ENTRENADOR", nombre: "Ana" }))).toBeNull();
  });
  test("oferta mayor que el precio", () => {
    expect(validarVitrinaItem(datos({ precioUSD: 10, ofertaUSD: 15 }))).toMatch(/mayor/);
  });
  test("montos no numéricos o negativos", () => {
    expect(validarVitrinaItem(datos({ precioUSD: Number.NaN }))).toMatch(/precio/i);
    expect(validarVitrinaItem(datos({ ofertaUSD: -1 }))).toMatch(/oferta/i);
  });
  test("descuento fuera de rango", () => {
    expect(validarVitrinaItem(datos({ descuentoPct: 150 }))).toMatch(/0 y 100/);
    expect(validarVitrinaItem(datos({ descuentoPct: Number.NaN }))).toMatch(/0 y 100/);
  });
  test("duración fuera de rango o no entera", () => {
    expect(validarVitrinaItem(datos({ duracionSeg: 2 }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: 301 }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: 7.5 }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: Number.NaN }))).toMatch(/entre 3 y 300/);
    expect(validarVitrinaItem(datos({ duracionSeg: 10 }))).toBeNull();
  });
  test("fechas invertidas", () => {
    const error = validarVitrinaItem(datos({ inicio: new Date("2026-10-20T00:00:00Z"), fin: new Date("2026-10-10T00:00:00Z") }));
    expect(error).toMatch(/fin/);
  });
  test("textos demasiado largos", () => {
    expect(validarVitrinaItem(datos({ etiqueta: "x".repeat(21) }))).toMatch(/20/);
    expect(validarVitrinaItem(datos({ frase: "x".repeat(121) }))).toMatch(/120/);
  });
});
```

`packages/domain/services/manifiestoVitrina.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import { armarManifiesto, itemsDeManifiesto, urlsDeManifiesto } from "./manifiestoVitrina";

const AHORA = new Date("2026-10-15T16:00:00Z");
const ajustes = { duracionSeg: 12, transicion: "FUNDIDO" as const, version: 7 };
const armar = (items: ReturnType<typeof itemDePrueba>[], tasaBcv = null as { valor: number; fecha: string } | null) =>
  armarManifiesto({ items, ajustes, tasaBcv, ahora: AHORA });

describe("armarManifiesto", () => {
  test("excluye inactivos y vencidos, mantiene los futuros", () => {
    const m = armar([
      itemDePrueba({ id: "activo", orden: 1 }),
      itemDePrueba({ id: "inactivo", orden: 2, activo: false }),
      itemDePrueba({ id: "vencido", orden: 3, fin: new Date("2026-10-10T00:00:00Z") }),
      itemDePrueba({ id: "futuro", orden: 4, inicio: new Date("2026-11-01T00:00:00Z") }),
    ]);
    expect(m.items.map((i) => i.id)).toEqual(["activo", "futuro"]);
  });

  test("copia versión, ajustes, tasa y la hora del servidor", () => {
    const tasa = { valor: 40.5, fecha: "2026-10-15T00:00:00.000Z" };
    const m = armar([], tasa);
    expect(m).toMatchObject({ version: 7, duracionSeg: 12, transicion: "FUNDIDO", tasaBcv: tasa, items: [] });
    expect(m.servidorAhora).toBe("2026-10-15T16:00:00.000Z");
  });

  test("ordena por orden y serializa las fechas en ISO", () => {
    const m = armar([
      itemDePrueba({ id: "b", orden: 2 }),
      itemDePrueba({ id: "a", orden: 1, inicio: new Date("2026-10-01T04:00:00Z"), fin: new Date("2026-10-31T03:59:59.999Z") }),
    ]);
    expect(m.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(m.items[0].inicio).toBe("2026-10-01T04:00:00.000Z");
    expect(m.items[0].fin).toBe("2026-10-31T03:59:59.999Z");
    expect(m.items[1].inicio).toBeNull();
  });
});

describe("itemsDeManifiesto", () => {
  test("revive las fechas", () => {
    const original = itemDePrueba({ id: "a", inicio: new Date("2026-10-01T04:00:00Z"), fin: new Date("2026-10-31T03:59:59.999Z") });
    const [item] = itemsDeManifiesto(JSON.parse(JSON.stringify(armar([original]))));
    expect(item.inicio).toEqual(original.inicio);
    expect(item.fin).toEqual(original.fin);
    expect(item.activo).toBe(true);
  });
});

describe("urlsDeManifiesto", () => {
  test("incluye medios y pósters, sin repetir ni nulos", () => {
    const m = armar([
      itemDePrueba({ id: "a", orden: 1, mediaUrl: "https://r2.test/vitrina/a.mp4", mediaTipo: "VIDEO", posterUrl: "https://r2.test/vitrina/a.jpg" }),
      itemDePrueba({ id: "b", orden: 2, mediaUrl: "https://r2.test/vitrina/b.webp" }),
      itemDePrueba({ id: "c", orden: 3, mediaUrl: "https://r2.test/vitrina/b.webp" }),
    ]);
    expect(urlsDeManifiesto(m).sort()).toEqual([
      "https://r2.test/vitrina/a.jpg",
      "https://r2.test/vitrina/a.mp4",
      "https://r2.test/vitrina/b.webp",
    ]);
  });
});
```

Run: `npm test --workspace packages/domain -- utils/vitrinaBadges utils/vitrinaItem services/manifiestoVitrina`. Expected: FAIL.

- [ ] **Step 2: Implementar**

`packages/domain/utils/vitrinaBadges.ts`:

```ts
import type { VitrinaItem } from "../entities/Vitrina";
import type { EstadoTasa } from "./estadoTasa";

// El precio que la TV considera "vigente": la oferta si está activa; si no, el precio solo si se muestra
// (con el precio oculto no se calcula un equivalente que lo delataría).
export function precioVigenteUSD(item: VitrinaItem): number | null {
  if (item.mostrarOferta && item.ofertaUSD !== null) return item.ofertaUSD;
  return item.mostrarPrecio ? item.precioUSD : null;
}

export function descuentoMostrado(item: VitrinaItem): number | null {
  if (!item.mostrarDescuento) return null;
  if (item.descuentoPct !== null) return item.descuentoPct;
  if (item.precioUSD !== null && item.ofertaUSD !== null && item.precioUSD > 0 && item.ofertaUSD < item.precioUSD) {
    return Math.round((1 - item.ofertaUSD / item.precioUSD) * 100);
  }
  return null;
}

// Bs = precio vigente x tasa BCV; se oculta con la tasa desactualizada, sin tasa o con la bandera apagada.
export function equivalenteBs(item: VitrinaItem, tasa: { valor: number; estado: EstadoTasa } | null): number | null {
  if (!item.mostrarEquivalenteBs || tasa === null || tasa.estado === "DESACTUALIZADA") return null;
  const precio = precioVigenteUSD(item);
  if (precio === null) return null;
  return Math.round(precio * tasa.valor * 100) / 100;
}
```

`packages/domain/utils/vitrinaItem.ts`:

```ts
import type { DatosVitrinaItem } from "../entities/Vitrina";

export const DURACION_MIN_SEG = 3;
export const DURACION_MAX_SEG = 300;

// Campo numérico de un formulario: vacío → null; con coma o punto decimal; texto no numérico → NaN (que la
// validación rechaza con su mensaje).
export function numeroOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(",", ".");
  return texto === "" ? null : Number(texto);
}

// Mensaje de error del primer problema de un ítem antes de guardarlo, o null si es válido.
export function validarVitrinaItem(d: DatosVitrinaItem): string | null {
  if (!d.mediaUrl.trim()) return "Falta subir la imagen o el video.";
  if (d.tipo === "ENTRENADOR" && !d.nombre?.trim()) return "El entrenador necesita un nombre.";

  const limites: Array<[string | null, number, string]> = [
    [d.nombre, 60, "El nombre"],
    [d.especialidad, 60, "La especialidad"],
    [d.frase, 120, "La frase"],
    [d.etiqueta, 20, "La etiqueta"],
  ];
  for (const [valor, maximo, que] of limites) {
    if (valor && valor.trim().length > maximo) return `${que} admite hasta ${maximo} caracteres.`;
  }

  for (const [valor, que] of [[d.precioUSD, "El precio"], [d.ofertaUSD, "La oferta"]] as const) {
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return `${que} no es un monto válido.`;
  }
  if (d.descuentoPct !== null && (!Number.isFinite(d.descuentoPct) || d.descuentoPct < 0 || d.descuentoPct > 100)) {
    return "El descuento debe estar entre 0 y 100 %.";
  }
  if (d.precioUSD !== null && d.ofertaUSD !== null && d.ofertaUSD > d.precioUSD) {
    return "La oferta no puede ser mayor que el precio.";
  }
  if (d.duracionSeg !== null && (!Number.isInteger(d.duracionSeg) || d.duracionSeg < DURACION_MIN_SEG || d.duracionSeg > DURACION_MAX_SEG)) {
    return `La duración debe ser un número entero entre ${DURACION_MIN_SEG} y ${DURACION_MAX_SEG} segundos.`;
  }
  if (d.inicio && d.fin && d.inicio.getTime() > d.fin.getTime()) return "La fecha de fin es anterior a la de inicio.";
  return null;
}
```

`packages/domain/services/manifiestoVitrina.ts`:

```ts
import type { AjustesVitrina, ItemManifiesto, ManifiestoVitrina, VitrinaItem } from "../entities/Vitrina";
import { estaVencido } from "./secuenciaVitrina";

// El manifiesto excluye los ítems inactivos y los ya vencidos (la TV borra sus archivos) y mantiene los
// futuros (la TV los muestra cuando llegue su fecha, incluso sin red).
export function armarManifiesto(entrada: {
  items: VitrinaItem[];
  ajustes: AjustesVitrina;
  tasaBcv: { valor: number; fecha: string } | null;
  ahora: Date;
}): ManifiestoVitrina {
  const items: ItemManifiesto[] = entrada.items
    .filter((item) => item.activo && !estaVencido(item, entrada.ahora))
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
    .map((item) => ({ ...item, inicio: item.inicio?.toISOString() ?? null, fin: item.fin?.toISOString() ?? null }));
  return {
    version: entrada.ajustes.version,
    servidorAhora: entrada.ahora.toISOString(),
    duracionSeg: entrada.ajustes.duracionSeg,
    transicion: entrada.ajustes.transicion,
    tasaBcv: entrada.tasaBcv,
    items,
  };
}

export function itemsDeManifiesto(manifiesto: ManifiestoVitrina): VitrinaItem[] {
  return manifiesto.items.map((item) => ({
    ...item,
    inicio: item.inicio ? new Date(item.inicio) : null,
    fin: item.fin ? new Date(item.fin) : null,
  }));
}

// Todas las piezas que la TV debe tener en disco: medios y pósters, sin repetir.
export function urlsDeManifiesto(manifiesto: ManifiestoVitrina): string[] {
  const urls = new Set<string>();
  for (const item of manifiesto.items) {
    urls.add(item.mediaUrl);
    if (item.posterUrl) urls.add(item.posterUrl);
  }
  return [...urls];
}
```

- [ ] **Step 3: Ejecutar**

Run: `npm test --workspace packages/domain`. Expected: todo en verde.

- [ ] **Step 4: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega badges de precio, validación de ítems y armado del manifiesto de la vitrina
```

---

### Task 5: Dominio, video MP4, imágenes de la vitrina y emisor de eventos

**Files:**
- Create: `packages/domain/utils/mp4.ts`, `packages/domain/utils/mp4.test.ts`
- Create: `packages/domain/utils/videoVitrina.ts`, `packages/domain/utils/videoVitrina.test.ts`
- Create: `packages/domain/utils/emisorEventos.ts`, `packages/domain/utils/emisorEventos.test.ts`
- Modify: `packages/domain/utils/imagenSubida.ts`, `packages/domain/utils/imagenSubida.test.ts`

**Interfaces:**
- Produces (`utils/mp4`): `InfoMp4 = { codec: string; anchoMostrado: number; altoMostrado: number; rotacion: 0 | 90 | 180 | 270 }`, `LectorBytes = (desde: number, largo: number) => Promise<Uint8Array>`, `class ErrorMp4 extends Error`, `analizarMp4(lector: LectorBytes, tamano: number): Promise<InfoMp4>`.
- Produces (`utils/videoVitrina`): `MAX_BYTES_VIDEO_VITRINA` (100 MB), `MAX_LADO_MAYOR_VIDEO = 1920`, `MAX_LADO_MENOR_VIDEO = 1080`, `CODECS_H264 = ["avc1", "avc3"]`, `validarVideo(info: InfoMp4, bytes: number, soloVertical: boolean): string | null`.
- Produces (`utils/imagenSubida`): `MAX_BYTES_IMAGEN_VITRINA` (8 MB), `MAX_LADO_IMAGEN_VITRINA = 1920`, `extensionDeImagen(contentType, bytes, maxBytes = MAX_BYTES_IMAGEN)`.
- Produces (`utils/emisorEventos`): `crearEmisor(): { suscribir(clave: string, oyente: (evento: string) => void): () => void; emitir(clave: string, evento: string): number }`.

- [ ] **Step 1: Pruebas que fallan**

`packages/domain/utils/mp4.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { analizarMp4, ErrorMp4, type LectorBytes } from "./mp4";

const texto = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const fijo = (n: number) => u32(Math.round(n * 65536));
const ceros = (n: number) => new Array<number>(n).fill(0);
const caja = (tipo: string, ...partes: number[][]): number[] => {
  const cuerpo = partes.flat();
  return [...u32(8 + cuerpo.length), ...texto(tipo), ...cuerpo];
};
// Matriz 3x3 de transformación: a b u / c d v / x y w, con w en punto fijo 2.30.
const matriz = (a: number, b: number, c: number, d: number) => [
  ...fijo(a), ...fijo(b), ...u32(0), ...fijo(c), ...fijo(d), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000),
];
const ROT = { 0: matriz(1, 0, 0, 1), 90: matriz(0, 1, -1, 0), 180: matriz(-1, 0, 0, -1), 270: matriz(0, -1, 1, 0) };

interface OpcionesPista { ancho?: number; alto?: number; rot?: 0 | 90 | 180 | 270; manejador?: string; version?: 0 | 1 }
function pista(codec: string, o: OpcionesPista = {}): number[] {
  const { ancho = 1920, alto = 1080, rot = 0, manejador = "vide", version = 0 } = o;
  const previo = version === 1 ? [1, 0, 0, 0, ...ceros(48)] : [0, 0, 0, 0, ...ceros(36)];
  return caja(
    "trak",
    caja("tkhd", previo, ROT[rot], fijo(ancho), fijo(alto)),
    caja(
      "mdia",
      caja("hdlr", [0, 0, 0, 0], [0, 0, 0, 0], texto(manejador), ceros(13)),
      caja("minf", caja("stbl", caja("stsd", [0, 0, 0, 0], [0, 0, 0, 1], caja(codec, ceros(8)))))
    )
  );
}
function archivo(pistas: number[][], moovAlFinal = true): Uint8Array {
  const ftyp = caja("ftyp", texto("isom"), u32(0), texto("isom"));
  const mdat = caja("mdat", ceros(100));
  const moov = caja("moov", ...pistas);
  return Uint8Array.from(moovAlFinal ? [...ftyp, ...mdat, ...moov] : [...ftyp, ...moov, ...mdat]);
}
const lector = (bytes: Uint8Array): LectorBytes => async (desde, largo) => bytes.slice(desde, desde + largo);
const analizar = (bytes: Uint8Array) => analizarMp4(lector(bytes), bytes.length);

describe("analizarMp4", () => {
  test("H.264 horizontal sin rotación", async () => {
    expect(await analizar(archivo([pista("avc1")]))).toEqual({ codec: "avc1", anchoMostrado: 1920, altoMostrado: 1080, rotacion: 0 });
  });

  test("lee el moov también cuando está al inicio (faststart)", async () => {
    expect((await analizar(archivo([pista("avc1")], false))).codec).toBe("avc1");
  });

  test("rotación de 90°: las dimensiones mostradas se intercambian", async () => {
    expect(await analizar(archivo([pista("avc1", { rot: 90 })]))).toEqual({ codec: "avc1", anchoMostrado: 1080, altoMostrado: 1920, rotacion: 90 });
  });

  test("rotación de 270°: también se intercambian", async () => {
    const info = await analizar(archivo([pista("avc1", { rot: 270 })]));
    expect(info).toMatchObject({ anchoMostrado: 1080, altoMostrado: 1920, rotacion: 270 });
  });

  test("rotación de 180°: no cambia las dimensiones", async () => {
    expect(await analizar(archivo([pista("avc1", { rot: 180 })]))).toMatchObject({ anchoMostrado: 1920, altoMostrado: 1080, rotacion: 180 });
  });

  test("HEVC de iPhone se reconoce por su códec", async () => {
    expect((await analizar(archivo([pista("hvc1", { ancho: 1920, alto: 1080, rot: 90 })]))).codec).toBe("hvc1");
  });

  test("tkhd de versión 1 (64 bits)", async () => {
    expect(await analizar(archivo([pista("avc1", { version: 1, ancho: 1280, alto: 720 })]))).toMatchObject({ anchoMostrado: 1280, altoMostrado: 720 });
  });

  test("salta las pistas de audio", async () => {
    const info = await analizar(archivo([pista("mp4a", { manejador: "soun" }), pista("avc1")]));
    expect(info.codec).toBe("avc1");
  });

  test("una caja de 64 bits (mdat grande) se recorre bien", async () => {
    const ftyp = caja("ftyp", texto("isom"), u32(0));
    const mdatGrande = [...u32(1), ...texto("mdat"), ...u32(0), ...u32(16 + 50), ...ceros(50)];
    const bytes = Uint8Array.from([...ftyp, ...mdatGrande, ...caja("moov", pista("avc1"))]);
    expect((await analizar(bytes)).codec).toBe("avc1");
  });

  test("sin moov: error claro", async () => {
    const bytes = Uint8Array.from([...caja("ftyp", texto("isom"), u32(0)), ...caja("mdat", ceros(10))]);
    await expect(analizar(bytes)).rejects.toThrow(ErrorMp4);
  });

  test("sin pista de video: error claro", async () => {
    await expect(analizar(archivo([pista("mp4a", { manejador: "soun" })]))).rejects.toThrow(/pista de video/);
  });

  test("archivo truncado: error de MP4 dañado", async () => {
    const completo = archivo([pista("avc1")]);
    await expect(analizar(completo.slice(0, completo.length - 20))).rejects.toThrow(ErrorMp4);
  });
});
```

`packages/domain/utils/videoVitrina.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { InfoMp4 } from "./mp4";
import { MAX_BYTES_VIDEO_VITRINA, validarVideo } from "./videoVitrina";

const info = (extra: Partial<InfoMp4> = {}): InfoMp4 => ({ codec: "avc1", anchoMostrado: 1080, altoMostrado: 1920, rotacion: 0, ...extra });
const MB = 1024 * 1024;

describe("validarVideo", () => {
  test("H.264 vertical dentro de los límites pasa", () => {
    expect(validarVideo(info(), 10 * MB, true)).toBeNull();
  });
  test("avc3 también es H.264", () => {
    expect(validarVideo(info({ codec: "avc3" }), 10 * MB, true)).toBeNull();
  });
  test("HEVC (iPhone) se rechaza y explica cómo convertirlo", () => {
    const error = validarVideo(info({ codec: "hvc1" }), 10 * MB, true);
    expect(error).toMatch(/H\.264/);
    expect(error).toMatch(/Más compatible/);
  });
  test("hev1 se trata igual que hvc1", () => {
    expect(validarVideo(info({ codec: "hev1" }), 10 * MB, true)).toMatch(/Más compatible/);
  });
  test("otro códec se rechaza sin la pista del iPhone", () => {
    const error = validarVideo(info({ codec: "vp09" }), 10 * MB, true);
    expect(error).toMatch(/H\.264/);
    expect(error).not.toMatch(/Más compatible/);
  });
  test("más de 100 MB se rechaza", () => {
    expect(validarVideo(info(), MAX_BYTES_VIDEO_VITRINA + 1, true)).toMatch(/100 MB/);
    expect(validarVideo(info(), MAX_BYTES_VIDEO_VITRINA, true)).toBeNull();
  });
  test("más de 1080x1920 se rechaza", () => {
    expect(validarVideo(info({ anchoMostrado: 2160, altoMostrado: 3840 }), 10 * MB, true)).toMatch(/1080x1920/);
  });
  test("el entrenador exige vertical; una promo puede ser horizontal", () => {
    const horizontal = info({ anchoMostrado: 1920, altoMostrado: 1080 });
    expect(validarVideo(horizontal, 10 * MB, true)).toMatch(/verticales/);
    expect(validarVideo(horizontal, 10 * MB, false)).toBeNull();
  });
});
```

`packages/domain/utils/emisorEventos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { crearEmisor } from "./emisorEventos";

describe("crearEmisor", () => {
  test("entrega el evento a los oyentes de esa clave y devuelve cuántos recibieron", () => {
    const emisor = crearEmisor();
    const a: string[] = [];
    const b: string[] = [];
    emisor.suscribir("sede-1", (e) => a.push(e));
    emisor.suscribir("sede-1", (e) => b.push(e));
    expect(emisor.emitir("sede-1", "vitrina:cambio")).toBe(2);
    expect(a).toEqual(["vitrina:cambio"]);
    expect(b).toEqual(["vitrina:cambio"]);
  });

  test("no cruza claves", () => {
    const emisor = crearEmisor();
    const recibidos: string[] = [];
    emisor.suscribir("sede-1", (e) => recibidos.push(e));
    expect(emisor.emitir("sede-2", "vitrina:cambio")).toBe(0);
    expect(recibidos).toEqual([]);
  });

  test("al desuscribirse ya no recibe", () => {
    const emisor = crearEmisor();
    const recibidos: string[] = [];
    const baja = emisor.suscribir("s", (e) => recibidos.push(e));
    baja();
    expect(emisor.emitir("s", "x")).toBe(0);
    expect(recibidos).toEqual([]);
  });

  test("un oyente que lanza no impide avisar a los demás", () => {
    const emisor = crearEmisor();
    const recibidos: string[] = [];
    emisor.suscribir("s", () => {
      throw new Error("conexión cerrada");
    });
    emisor.suscribir("s", (e) => recibidos.push(e));
    expect(emisor.emitir("s", "x")).toBe(1);
    expect(recibidos).toEqual(["x"]);
  });
});
```

Añadir a `packages/domain/utils/imagenSubida.test.ts` (importando también `MAX_BYTES_IMAGEN_VITRINA`):

```ts
describe("tope propio de la vitrina", () => {
  test("8 MB para los carteles, frente a 5 MB por defecto", () => {
    expect(MAX_BYTES_IMAGEN_VITRINA).toBe(8 * 1024 * 1024);
    expect(extensionDeImagen("image/webp", 6 * 1024 * 1024)).toBeNull();
    expect(extensionDeImagen("image/webp", 6 * 1024 * 1024, MAX_BYTES_IMAGEN_VITRINA)).toBe("webp");
    expect(extensionDeImagen("image/webp", MAX_BYTES_IMAGEN_VITRINA + 1, MAX_BYTES_IMAGEN_VITRINA)).toBeNull();
  });
});
```

(si el archivo no importa `describe`, añadirlo al import de `vitest`).

Run: `npm test --workspace packages/domain -- utils/mp4 utils/videoVitrina utils/emisorEventos utils/imagenSubida`. Expected: FAIL.

- [ ] **Step 2: Implementar**

`packages/domain/utils/mp4.ts`:

```ts
// Lector mínimo de MP4/MOV para validar un video ANTES de subirlo (la subida va directa a R2 y el servidor no lo
// ve). Recorre solo las cabeceras de las cajas hasta moov > trak > mdia/minf/stbl/stsd y tkhd; nunca carga el
// archivo entero (el moov puede estar al final de un video de 100 MB).
export class ErrorMp4 extends Error {}

export interface InfoMp4 {
  codec: string; // avc1/avc3 = H.264, hvc1/hev1 = HEVC…
  anchoMostrado: number; // ya aplicada la marca de rotación
  altoMostrado: number;
  rotacion: 0 | 90 | 180 | 270;
}

export type LectorBytes = (desde: number, largo: number) => Promise<Uint8Array>;

interface Caja {
  tipo: string;
  datos: number; // offset del contenido
  fin: number;
}

const decodificar = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const DANADO = "El archivo MP4 está dañado o incompleto.";

async function* cajas(lector: LectorBytes, desde: number, hasta: number): AsyncGenerator<Caja> {
  let pos = desde;
  while (pos + 8 <= hasta) {
    const cabecera = await lector(pos, 16);
    if (cabecera.length < 8) throw new ErrorMp4(DANADO);
    const vista = new DataView(cabecera.buffer, cabecera.byteOffset, cabecera.byteLength);
    let tamano = vista.getUint32(0);
    const tipo = decodificar(cabecera.subarray(4, 8));
    let largoCabecera = 8;
    if (tamano === 1) {
      if (cabecera.length < 16) throw new ErrorMp4(DANADO);
      tamano = Number(vista.getBigUint64(8));
      largoCabecera = 16;
    } else if (tamano === 0) {
      tamano = hasta - pos; // la última caja llega hasta el final
    }
    if (tamano < largoCabecera || pos + tamano > hasta) throw new ErrorMp4(DANADO);
    yield { tipo, datos: pos + largoCabecera, fin: pos + tamano };
    pos += tamano;
  }
}

async function buscar(lector: LectorBytes, padre: Caja, ruta: string[]): Promise<Caja | null> {
  let actual = padre;
  for (const tipo of ruta) {
    let encontrada: Caja | null = null;
    for await (const caja of cajas(lector, actual.datos, actual.fin)) {
      if (caja.tipo === tipo) {
        encontrada = caja;
        break;
      }
    }
    if (!encontrada) return null;
    actual = encontrada;
  }
  return actual;
}

function rotacionDe(a: number, b: number): 0 | 90 | 180 | 270 {
  if (Math.abs(a) >= Math.abs(b)) return a >= 0 ? 0 : 180;
  return b >= 0 ? 90 : 270;
}

async function analizarPista(lector: LectorBytes, pista: Caja): Promise<InfoMp4 | null> {
  const hdlr = await buscar(lector, pista, ["mdia", "hdlr"]);
  if (!hdlr || decodificar(await lector(hdlr.datos + 8, 4)) !== "vide") return null;
  const tkhd = await buscar(lector, pista, ["tkhd"]);
  const stsd = await buscar(lector, pista, ["mdia", "minf", "stbl", "stsd"]);
  if (!tkhd || !stsd) return null;

  const codec = decodificar(await lector(stsd.datos + 12, 4));
  const version = (await lector(tkhd.datos, 1))[0];
  const matriz = await lector(tkhd.datos + (version === 1 ? 52 : 40), 44); // matriz (36) + ancho + alto
  const vista = new DataView(matriz.buffer, matriz.byteOffset, matriz.byteLength);
  const rotacion = rotacionDe(vista.getInt32(0) / 65536, vista.getInt32(4) / 65536);
  const ancho = vista.getUint32(36) / 65536;
  const alto = vista.getUint32(40) / 65536;
  const gira = rotacion === 90 || rotacion === 270;
  return {
    codec,
    anchoMostrado: Math.round(gira ? alto : ancho),
    altoMostrado: Math.round(gira ? ancho : alto),
    rotacion,
  };
}

export async function analizarMp4(lector: LectorBytes, tamano: number): Promise<InfoMp4> {
  let moov: Caja | null = null;
  for await (const caja of cajas(lector, 0, tamano)) {
    if (caja.tipo === "moov") {
      moov = caja;
      break;
    }
  }
  if (!moov) throw new ErrorMp4("No es un video MP4 válido (falta la información del video).");

  for await (const pista of cajas(lector, moov.datos, moov.fin)) {
    if (pista.tipo !== "trak") continue;
    const info = await analizarPista(lector, pista);
    if (info) return info;
  }
  throw new ErrorMp4("El archivo no contiene una pista de video.");
}
```

`packages/domain/utils/videoVitrina.ts`:

```ts
import type { InfoMp4 } from "./mp4";

export const MAX_BYTES_VIDEO_VITRINA = 100 * 1024 * 1024;
export const MAX_LADO_MAYOR_VIDEO = 1920;
export const MAX_LADO_MENOR_VIDEO = 1080;
export const CODECS_H264 = ["avc1", "avc3"];
const CODECS_HEVC = ["hvc1", "hev1"];

// Mensaje de error si el video no sirve para la TV, o null. Las dimensiones ya vienen con la rotación aplicada.
export function validarVideo(info: InfoMp4, bytes: number, soloVertical: boolean): string | null {
  if (bytes > MAX_BYTES_VIDEO_VITRINA) return "El video pesa más de 100 MB.";
  if (!CODECS_H264.includes(info.codec)) {
    const base = "El video debe estar en formato H.264 (MP4).";
    return CODECS_HEVC.includes(info.codec)
      ? `${base} Parece HEVC (el formato por defecto del iPhone): en el iPhone usa Ajustes > Cámara > Formatos > "Más compatible", o conviértelo a H.264 (por ejemplo con HandBrake).`
      : `${base} Conviértelo a H.264 (por ejemplo con HandBrake).`;
  }
  const mayor = Math.max(info.anchoMostrado, info.altoMostrado);
  const menor = Math.min(info.anchoMostrado, info.altoMostrado);
  if (mayor > MAX_LADO_MAYOR_VIDEO || menor > MAX_LADO_MENOR_VIDEO) {
    return `El video supera 1080x1920 (el suyo es ${info.anchoMostrado}x${info.altoMostrado}). Redúcelo a 1080p.`;
  }
  if (soloVertical && info.altoMostrado < info.anchoMostrado) return "Los videos de entrenadores deben ser verticales.";
  return null;
}
```

`packages/domain/utils/emisorEventos.ts`:

```ts
export type Oyente = (evento: string) => void;

// Pub/sub en memoria por clave (la sede). Sirve mientras web-admin corra en un solo contenedor; con varias
// instancias se reemplaza por LISTEN/NOTIFY de Postgres sin tocar a la TV.
export function crearEmisor() {
  const oyentes = new Map<string, Set<Oyente>>();
  return {
    suscribir(clave: string, oyente: Oyente): () => void {
      const conjunto = oyentes.get(clave) ?? new Set<Oyente>();
      conjunto.add(oyente);
      oyentes.set(clave, conjunto);
      return () => {
        conjunto.delete(oyente);
        if (conjunto.size === 0) oyentes.delete(clave);
      };
    },
    // Devuelve a cuántos oyentes llegó el evento; uno que lanza (conexión ya cerrada) no afecta a los demás.
    emitir(clave: string, evento: string): number {
      let entregados = 0;
      for (const oyente of [...(oyentes.get(clave) ?? [])]) {
        try {
          oyente(evento);
          entregados += 1;
        } catch {
          // el oyente se limpia solo al cerrarse su conexión
        }
      }
      return entregados;
    },
  };
}
```

En `packages/domain/utils/imagenSubida.ts`:

```ts
// El panel comprime las imágenes antes de subirlas; este tope solo frena subidas anómalas.
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
// Carteles y fotos de la vitrina: hasta 1920 px de lado y 8 MB (un PNG de 1920x1080 puede pasar de 5 MB).
export const MAX_BYTES_IMAGEN_VITRINA = 8 * 1024 * 1024;
export const MAX_LADO_IMAGEN_VITRINA = 1920;
```

y la firma pasa a `export function extensionDeImagen(contentType: string, bytes: number, maxBytes = MAX_BYTES_IMAGEN): string | null` con `if (bytes <= 0 || bytes > maxBytes) return null;`.

- [ ] **Step 3: Ejecutar**

Run: `npm test --workspace packages/domain`. Expected: todo en verde.

- [ ] **Step 4: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el lector de MP4, la validación de video, el tope de imágenes de la vitrina y el emisor de eventos
```

---

### Task 6: Migración sin tocar producción

> **Esta tarea no toca producción en ningún momento.** El Postgres local de Docker existe **solo** para validar la migración: aplicar el historial completo y comprobar que no hay drift. No se usa para correr web-admin ni para sembrar datos (zip-gym ya existe en producción). La migración llegará a producción en el **Deploy 1**, que hace el usuario al terminar esta tarea. Prohibido en toda esta tarea: `prisma db seed`, `migrate dev`, `migrate reset`, `db push`, y `migrate deploy` o cualquier `npm run db:*` con la config por defecto.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma7.local.config.ts`
- Create: `packages/db/prisma/migrations/20261015000000_vitrina/migration.sql`
- Modify: `.dockerignore` (añadir `packages/db/prisma7.local.config.ts`)

**Interfaces:**
- Produces: modelo `VitrinaItem`, enums `TipoVitrinaItem` y `TipoMedioVitrina`, columnas `Sucursal.vitrinaDuracionSeg`, `Sucursal.vitrinaTransicion`, `Sucursal.vitrinaVersion`; el cliente Prisma regenerado los expone.

- [ ] **Step 1: Editar el esquema**

En `packages/db/prisma/schema.prisma`, dentro de `model Sucursal`, tras `reposoOpacidad ...` añadir:

```prisma
  vitrinaDuracionSeg Int         @default(12) // duración por defecto de cada diapositiva de la vitrina (segundos)
  vitrinaTransicion  String      @default("FUNDIDO") // FUNDIDO | DESLIZAR
  vitrinaVersion     Int         @default(0) // se incrementa en cada cambio de contenido de la vitrina
```

y, junto a las otras listas de relaciones de `Sucursal` (tras `padronHojas PadronHoja[]`):

```prisma
  vitrinaItems       VitrinaItem[]
```

Al final del archivo añadir:

```prisma
enum TipoVitrinaItem {
  ENTRENADOR
  PROMO
  PRODUCTO
}

enum TipoMedioVitrina {
  IMAGEN
  VIDEO
}

// Ítem de la secuencia de la TV (vitrina). Independiente de Producto y de UsuarioAdmin: el entrenador lleva su
// propio nombre y medio. Orden global por sucursal; nace inactivo.
model VitrinaItem {
  id         String           @id @default(cuid())
  sucursalId String
  sucursal   Sucursal         @relation(fields: [sucursalId], references: [id], onDelete: Cascade)
  tipo       TipoVitrinaItem
  orden      Int
  activo     Boolean          @default(false)

  duracionSeg Int? // nulo = la de la sede
  inicio      DateTime?
  fin         DateTime?

  mediaUrl  String
  mediaTipo TipoMedioVitrina
  posterUrl String?

  precioUSD            Decimal? @db.Decimal(10, 2)
  ofertaUSD            Decimal? @db.Decimal(10, 2)
  descuentoPct         Int?
  etiqueta             String?
  mostrarPrecio        Boolean  @default(true)
  mostrarOferta        Boolean  @default(true)
  mostrarDescuento     Boolean  @default(true)
  mostrarEtiqueta      Boolean  @default(true)
  mostrarEquivalenteBs Boolean  @default(true)

  nombre              String?
  especialidad        String?
  frase               String?
  mostrarMedio        Boolean @default(true)
  mostrarNombre       Boolean @default(true)
  mostrarEspecialidad Boolean @default(true)
  mostrarFrase        Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([sucursalId, orden])
}
```

- [ ] **Step 2: Config local de Prisma (nunca carga el `.env`)**

`packages/db/prisma7.local.config.ts`:

```ts
// Config de Prisma SOLO para una base local desechable. A diferencia de prisma7.config.ts, no carga el
// .env de la raíz (que apunta a producción): lee DATABASE_URL_LOCAL de packages/db/.env.local y aborta si el
// host no es localhost. Toda operación de Prisma de la vitrina usa `--config prisma7.local.config.ts`.
import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

config({ path: path.resolve(__dirname, ".env.local"), quiet: true });

const url = process.env["DATABASE_URL_LOCAL"];
if (!url) throw new Error("Falta DATABASE_URL_LOCAL (packages/db/.env.local). No se usa el .env de producción.");
const host = new URL(url).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(`DATABASE_URL_LOCAL apunta a "${host}": solo se permite localhost o 127.0.0.1.`);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
```

- [ ] **Step 2b: Excluir la config local de la imagen de producción**

`docker-entrypoint.sh` corre `prisma migrate deploy` **sin `--config`** dentro de `migrate-toolkit/packages/db`, y esa carpeta se copia desde el contexto de build. `prisma7.local.config.ts` aborta si falta `DATABASE_URL_LOCAL`, así que no debe llegar al contenedor: así este solo ve `prisma7.config.ts`, como hoy. Añadir al final de `.dockerignore` (raíz del repo):

```text
packages/db/prisma7.local.config.ts
```

Comprobar:

```bash
cd /c/dev/gym-app
tail -3 .dockerignore
```

Expected: la última línea es `packages/db/prisma7.local.config.ts`. (`.env.local` de `packages/db` solo contiene credenciales de `localhost` y no es secreto; el patrón `.env*` del `.dockerignore` solo cubre la raíz, no esa carpeta.)

- [ ] **Step 3: Postgres local desechable**

```bash
docker run --name gym-vitrina-pg -e POSTGRES_PASSWORD=local -p 54329:5432 -d postgres:16
printf 'DATABASE_URL_LOCAL=postgresql://postgres:local@localhost:54329/postgres\n' > packages/db/.env.local
git check-ignore packages/db/.env.local
```

Expected: el último comando imprime la ruta (el archivo está ignorado por `.env*`).

**Alternativa si Docker no está instalado** (caso de esta máquina: hay PostgreSQL 18 en `C:\Program Files\PostgreSQL\18\bin`, pero no Docker): un clúster desechable propio, en otro puerto, solo en localhost y sin tocar el servicio de Postgres instalado ni sus credenciales:

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
PGDIR="$(mktemp -d)/pgdata"
"$PGBIN/initdb" -D "$PGDIR" -U postgres --auth=trust -E UTF8
"$PGBIN/pg_ctl" -D "$PGDIR" -o "-p 54329 -c listen_addresses=127.0.0.1" -l "$PGDIR/../pg.log" -w start
printf 'DATABASE_URL_LOCAL=postgresql://postgres@localhost:54329/postgres\n' > packages/db/.env.local
git check-ignore packages/db/.env.local
```

Al terminar (Step 9) se detiene y se borra en lugar de `docker rm -f`: `"$PGBIN/pg_ctl" -D "$PGDIR" stop -m fast && rm -rf "$(dirname "$PGDIR")"` y se elimina `packages/db/.env.local`. Mismas garantías: la config local solo acepta `localhost`/`127.0.0.1`.

- [ ] **Step 4: Confirmar las opciones de `migrate diff` de esta versión de Prisma**

```bash
cd packages/db
npx prisma migrate diff --help --config prisma7.local.config.ts
```

Anotar los nombres exactos de las opciones de origen y destino (en Prisma 7: `--from-schema`/`--to-schema`, `--from-config-datasource`, `--script`, `--exit-code`). Si difieren de los usados abajo, usar los de la ayuda.

- [ ] **Step 5: Generar el SQL sin conectarse a ninguna base**

```bash
cd /c/dev/gym-app/packages/db
ANTERIOR="$(mktemp -d)/schema-anterior.prisma"
git show HEAD:packages/db/prisma/schema.prisma > "$ANTERIOR"
mkdir -p prisma/migrations/20261015000000_vitrina
npx prisma migrate diff --config prisma7.local.config.ts \
  --from-schema "$ANTERIOR" --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20261015000000_vitrina/migration.sql
head -30 prisma/migrations/20261015000000_vitrina/migration.sql
```

Expected: `CREATE TYPE "TipoVitrinaItem"`, `CREATE TYPE "TipoMedioVitrina"`, `ALTER TABLE "Sucursal" ADD COLUMN ...`, `CREATE TABLE "VitrinaItem"`, `CREATE INDEX`, `ADD CONSTRAINT ... FOREIGN KEY`.

- [ ] **Step 6: Comprobar que es solo aditiva**

```bash
grep -Ei "^(DROP |DELETE FROM|UPDATE |TRUNCATE)|RENAME|ALTER COLUMN|DROP COLUMN|DROP TABLE" prisma/migrations/20261015000000_vitrina/migration.sql && echo "NO ADITIVA" || echo "ADITIVA"
```

Expected: `ADITIVA`. Si imprime `NO ADITIVA`, revisar el esquema (algo existente cambió) antes de seguir.

- [ ] **Step 7: Aplicar el historial completo a la base local y comprobar que no hay drift**

```bash
npx prisma migrate deploy --config prisma7.local.config.ts
npx prisma migrate diff --config prisma7.local.config.ts --from-config-datasource --to-schema prisma/schema.prisma --exit-code
echo "exit=$?"
```

Expected: `migrate deploy` aplica todas las migraciones (la nueva incluida) sin error; el `diff` termina con `exit=0` (sin diferencias entre la base resultante y el esquema).

- [ ] **Step 8: Regenerar el cliente y comprobar que web-admin compila (tipos, build y lint)**

El Deploy 1 cambia código de producción (`formatearBs` movido al dominio, `ObtenerTasaVigente` refactorizado y cliente de Prisma regenerado), así que no basta con `tsc`. Hacerlo **con el Postgres local todavía levantado**, pasando su URL inline para que el build no toque la base de producción:

```bash
cd /c/dev/gym-app/packages/db
npx prisma generate --config prisma7.local.config.ts
cd /c/dev/gym-app
(cd apps/web-admin && npx tsc --noEmit)
DATABASE_URL=postgresql://postgres:local@localhost:54329/postgres npm run build --workspace apps/web-admin
npm run lint --workspace apps/web-admin
npm test --workspace packages/domain
```

Expected: todo sin errores. **Si algo falla, corregirlo antes de pasar al Punto de control A: no se le pide el Deploy 1 al usuario con un build o un lint rotos.**

- [ ] **Step 9: Limpiar y sugerir el commit**

```bash
docker rm -f gym-vitrina-pg
cd /c/dev/gym-app
```

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega la migración aditiva de la vitrina y una config de Prisma solo para base local
```

- [ ] **Step 10: PUNTO DE CONTROL A: detenerse y esperar al usuario (Deploy 1)**

El agente no hace push ni despliega. **Precondición:** el Step 8 terminó con `build`, `lint` y tests en verde. Avisar al usuario de que **las Tasks 1 a 6 están completas en el working tree** (incluida la línea nueva de `.dockerignore`) y pedirle, en este orden:

1. Revisar el working tree y hacer commit y push (con los mensajes sugeridos de las Tasks 1 a 6; recordar el `git update-index --chmod=+x` del `gradlew`).
2. Hacer el **Deploy 1**: al arrancar el contenedor, `docker-entrypoint.sh` aplica la migración `20261015000000_vitrina` en producción. Es solo aditiva (verificada en el Step 6), pero si `migrate deploy` fallara, web-admin y el check-in no arrancan: el usuario debe vigilar el arranque.
3. **Confirmar explícitamente que la migración quedó aplicada en producción.**

**No empezar la Task 7 ni la Task 8 sin esa confirmación** (la Task 8 consulta las tablas nuevas contra la base de producción). Con la confirmación, ejecutar primero el **Step 15 de la Task 1** (APK de prueba en el TV real) y registrar sus resultados; si invalidan el diseño, detenerse y avisar.

---

### Task 7: Repositorio de la vitrina y almacenamiento R2 con subida prefirmada

> **Precondición:** el usuario ya confirmó el Punto de control A (Deploy 1 hecho y migración aplicada en producción) y se registró el resultado de la prueba en el TV real. Sin eso, no empezar.

**Files:**
- Create: `packages/domain/ports/IVitrinaRepository.ts`
- Create: `packages/infrastructure/persistence/prisma/PrismaVitrinaRepository.ts`
- Modify: `packages/domain/ports/IArchivoStorageService.ts`
- Modify: `packages/infrastructure/storage/R2StorageService.ts`
- Modify: `packages/infrastructure/package.json` (dependencia nueva)

**Interfaces:**
- Consumes: `VitrinaItem`, `DatosVitrinaItem`, `CambiosVitrinaItem`, `AjustesVitrina`, `TransicionVitrina` (Task 3); modelo Prisma `VitrinaItem` (Task 6).
- Produces (`IVitrinaRepository`): `listar(sucursalId): Promise<VitrinaItem[]>`, `buscar(sucursalId, id): Promise<VitrinaItem | null>`, `crear(sucursalId, datos): Promise<VitrinaItem>`, `actualizar(sucursalId, id, cambios): Promise<VitrinaItem | null>`, `eliminar(sucursalId, id): Promise<VitrinaItem | null>`, `mover(sucursalId, id, direccion: "SUBIR" | "BAJAR"): Promise<boolean>`, `obtenerAjustes(sucursalId): Promise<AjustesVitrina>`, `guardarAjustes(sucursalId, ajustes: { duracionSeg: number; transicion: TransicionVitrina }): Promise<AjustesVitrina>`. Cada método que escribe incrementa `Sucursal.vitrinaVersion` **dentro de su transacción** y resuelve solo tras el commit.
- Produces (`IArchivoStorageService`): `subir(carpeta, nombreArchivo, contenido, contentType, cacheControl?)`, `urlPrefirmada(carpeta, nombreArchivo, contentType, cacheControl): Promise<SubidaPrefirmada>`, `inspeccionar(urlPublica): Promise<{ bytes: number; contentType: string } | null>`, `eliminar(urlPublica): Promise<void>`; `SubidaPrefirmada = { urlSubida: string; urlPublica: string; clave: string; cabeceras: Record<string, string> }`.

- [ ] **Step 1: Instalar el firmador de URLs**

```bash
cd /c/dev/gym-app
npm install @aws-sdk/s3-request-presigner@^3.1136.0 --workspace packages/infrastructure --package-lock-only
git diff --stat -- package-lock.json packages/infrastructure/package.json
```

Expected: `packages/infrastructure/package.json` lista `@aws-sdk/s3-request-presigner` en `dependencies`.

- [ ] **Step 2: Puerto de almacenamiento**

Reemplazar `packages/domain/ports/IArchivoStorageService.ts`:

```ts
export interface SubidaPrefirmada {
  /** URL a la que el navegador hace PUT con `cabeceras` exactamente como vienen. */
  urlSubida: string;
  /** URL pública definitiva del archivo, una vez subido. */
  urlPublica: string;
  clave: string;
  cabeceras: Record<string, string>;
}

export interface IArchivoStorageService {
  /**
   * Sube un archivo binario y devuelve la URL pública para acceder a él.
   * @param carpeta Prefijo lógico dentro del storage (p. ej. "miembros").
   * @param nombreArchivo Nombre final del archivo, incluida la extensión.
   * @param contenido Contenido binario del archivo.
   * @param contentType Tipo MIME del archivo (p. ej. "image/jpeg").
   * @param cacheControl Cabecera Cache-Control del objeto (opcional).
   */
  subir(carpeta: string, nombreArchivo: string, contenido: Buffer, contentType: string, cacheControl?: string): Promise<string>;

  /** URL firmada para que el navegador suba un archivo grande directo al storage (sin pasar por el servidor). */
  urlPrefirmada(carpeta: string, nombreArchivo: string, contentType: string, cacheControl: string): Promise<SubidaPrefirmada>;

  /** Tamaño y tipo reales de un archivo ya subido, o null si no existe. */
  inspeccionar(urlPublica: string): Promise<{ bytes: number; contentType: string } | null>;

  /** Borra un archivo a partir de su URL pública. Solo acepta URLs del propio bucket. */
  eliminar(urlPublica: string): Promise<void>;
}
```

- [ ] **Step 3: Adaptador R2**

Reemplazar `packages/infrastructure/storage/R2StorageService.ts`:

```ts
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IArchivoStorageService, SubidaPrefirmada } from "@gym-app/domain/ports/IArchivoStorageService";

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // URL pública del bucket (R2.dev subdomain o dominio propio), sin slash final.
  publicUrl: string;
}

const EXPIRA_SUBIDA_SEG = 600;

// Adapter sobre Cloudflare R2 usando su API compatible con S3. Las fotos pequeñas se suben desde el servidor
// (`subir`); los videos grandes los sube el navegador directo con una URL prefirmada (`urlPrefirmada`), lo que
// exige CORS (PUT) en el bucket. Todo se sirve después por el dominio público del bucket.
export class R2StorageService implements IArchivoStorageService {
  private readonly cliente: S3Client;

  constructor(private readonly config: R2StorageConfig) {
    this.cliente = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async subir(carpeta: string, nombreArchivo: string, contenido: Buffer, contentType: string, cacheControl?: string): Promise<string> {
    const key = `${carpeta}/${nombreArchivo}`;

    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: contenido,
        ContentType: contentType,
        CacheControl: cacheControl,
      })
    );

    return `${this.config.publicUrl}/${key}`;
  }

  async urlPrefirmada(carpeta: string, nombreArchivo: string, contentType: string, cacheControl: string): Promise<SubidaPrefirmada> {
    const clave = `${carpeta}/${nombreArchivo}`;
    const urlSubida = await getSignedUrl(
      this.cliente,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: clave, ContentType: contentType, CacheControl: cacheControl }),
      { expiresIn: EXPIRA_SUBIDA_SEG }
    );
    return {
      urlSubida,
      urlPublica: `${this.config.publicUrl}/${clave}`,
      clave,
      cabeceras: { "Content-Type": contentType, "Cache-Control": cacheControl },
    };
  }

  async inspeccionar(urlPublica: string): Promise<{ bytes: number; contentType: string } | null> {
    try {
      const respuesta = await this.cliente.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.claveDe(urlPublica) }));
      return { bytes: respuesta.ContentLength ?? 0, contentType: respuesta.ContentType ?? "" };
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async eliminar(urlPublica: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.claveDe(urlPublica) }));
  }

  private claveDe(urlPublica: string): string {
    const prefijo = `${this.config.publicUrl}/`;
    if (!urlPublica.startsWith(prefijo)) throw new Error("La URL no pertenece al bucket de R2.");
    return urlPublica.slice(prefijo.length);
  }
}
```

- [ ] **Step 4: Puerto del repositorio**

`packages/domain/ports/IVitrinaRepository.ts`:

```ts
import type { AjustesVitrina, CambiosVitrinaItem, DatosVitrinaItem, TransicionVitrina, VitrinaItem } from "../entities/Vitrina";

// Todas las operaciones de escritura incrementan Sucursal.vitrinaVersion dentro de su transacción y resuelven
// solo después del commit: quien emite el aviso a la TV (vitrina:cambio) puede hacerlo apenas resuelven.
export interface IVitrinaRepository {
  /** Ítems de la sede, ordenados por `orden`. */
  listar(sucursalId: string): Promise<VitrinaItem[]>;
  buscar(sucursalId: string, id: string): Promise<VitrinaItem | null>;
  /** Crea el ítem al final de la secuencia y siempre inactivo. */
  crear(sucursalId: string, datos: DatosVitrinaItem): Promise<VitrinaItem>;
  actualizar(sucursalId: string, id: string, cambios: CambiosVitrinaItem): Promise<VitrinaItem | null>;
  /** Devuelve el ítem borrado (para poder eliminar sus archivos) o null si no existía. */
  eliminar(sucursalId: string, id: string): Promise<VitrinaItem | null>;
  /** Intercambia el ítem con su vecino. false si ya está en el extremo o no existe. */
  mover(sucursalId: string, id: string, direccion: "SUBIR" | "BAJAR"): Promise<boolean>;
  obtenerAjustes(sucursalId: string): Promise<AjustesVitrina>;
  guardarAjustes(sucursalId: string, ajustes: { duracionSeg: number; transicion: TransicionVitrina }): Promise<AjustesVitrina>;
}
```

- [ ] **Step 5: Repositorio Prisma**

`packages/infrastructure/persistence/prisma/PrismaVitrinaRepository.ts`:

```ts
import type { PrismaClient, VitrinaItem as FilaVitrinaItem } from "@gym-app/db/generated/prisma/client";
import type { IVitrinaRepository } from "@gym-app/domain/ports/IVitrinaRepository";
import {
  TRANSICIONES_VITRINA,
  type AjustesVitrina,
  type CambiosVitrinaItem,
  type DatosVitrinaItem,
  type TransicionVitrina,
  type VitrinaItem,
} from "@gym-app/domain/entities/Vitrina";

const aNumero = (valor: { toString(): string } | null): number | null => (valor === null ? null : Number(valor));

function mapear(fila: FilaVitrinaItem): VitrinaItem {
  return {
    id: fila.id,
    sucursalId: fila.sucursalId,
    tipo: fila.tipo,
    orden: fila.orden,
    activo: fila.activo,
    duracionSeg: fila.duracionSeg,
    inicio: fila.inicio,
    fin: fila.fin,
    mediaUrl: fila.mediaUrl,
    mediaTipo: fila.mediaTipo,
    posterUrl: fila.posterUrl,
    precioUSD: aNumero(fila.precioUSD),
    ofertaUSD: aNumero(fila.ofertaUSD),
    descuentoPct: fila.descuentoPct,
    etiqueta: fila.etiqueta,
    mostrarPrecio: fila.mostrarPrecio,
    mostrarOferta: fila.mostrarOferta,
    mostrarDescuento: fila.mostrarDescuento,
    mostrarEtiqueta: fila.mostrarEtiqueta,
    mostrarEquivalenteBs: fila.mostrarEquivalenteBs,
    nombre: fila.nombre,
    especialidad: fila.especialidad,
    frase: fila.frase,
    mostrarMedio: fila.mostrarMedio,
    mostrarNombre: fila.mostrarNombre,
    mostrarEspecialidad: fila.mostrarEspecialidad,
    mostrarFrase: fila.mostrarFrase,
  };
}

const sinIndefinidos = <T extends object>(objeto: T): T =>
  Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as T;

const subirVersion = { vitrinaVersion: { increment: 1 } };

export class PrismaVitrinaRepository implements IVitrinaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(sucursalId: string): Promise<VitrinaItem[]> {
    const filas = await this.prisma.vitrinaItem.findMany({ where: { sucursalId }, orderBy: [{ orden: "asc" }, { id: "asc" }] });
    return filas.map(mapear);
  }

  async buscar(sucursalId: string, id: string): Promise<VitrinaItem | null> {
    const fila = await this.prisma.vitrinaItem.findFirst({ where: { id, sucursalId } });
    return fila ? mapear(fila) : null;
  }

  async crear(sucursalId: string, datos: DatosVitrinaItem): Promise<VitrinaItem> {
    return this.prisma.$transaction(async (tx) => {
      const maximo = await tx.vitrinaItem.aggregate({ where: { sucursalId }, _max: { orden: true } });
      const fila = await tx.vitrinaItem.create({
        data: { ...datos, sucursalId, orden: (maximo._max.orden ?? -1) + 1, activo: false },
      });
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return mapear(fila);
    });
  }

  async actualizar(sucursalId: string, id: string, cambios: CambiosVitrinaItem): Promise<VitrinaItem | null> {
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.vitrinaItem.findFirst({ where: { id, sucursalId } });
      if (!existente) return null;
      const fila = await tx.vitrinaItem.update({ where: { id }, data: sinIndefinidos(cambios) });
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return mapear(fila);
    });
  }

  async eliminar(sucursalId: string, id: string): Promise<VitrinaItem | null> {
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.vitrinaItem.findFirst({ where: { id, sucursalId } });
      if (!existente) return null;
      await tx.vitrinaItem.delete({ where: { id } });
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return mapear(existente);
    });
  }

  async mover(sucursalId: string, id: string, direccion: "SUBIR" | "BAJAR"): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.vitrinaItem.findMany({
        where: { sucursalId },
        select: { id: true, orden: true },
        orderBy: [{ orden: "asc" }, { id: "asc" }],
      });
      const indice = filas.findIndex((f) => f.id === id);
      const destino = direccion === "SUBIR" ? indice - 1 : indice + 1;
      if (indice === -1 || destino < 0 || destino >= filas.length) return false;

      const ids = filas.map((f) => f.id);
      [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
      // Reescribe el orden como 0..n-1 (también limpia huecos y empates que dejen los borrados).
      for (const [posicion, itemId] of ids.entries()) {
        if (filas[posicion].id !== itemId || filas[posicion].orden !== posicion) {
          await tx.vitrinaItem.update({ where: { id: itemId }, data: { orden: posicion } });
        }
      }
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return true;
    });
  }

  async obtenerAjustes(sucursalId: string): Promise<AjustesVitrina> {
    const sucursal = await this.prisma.sucursal.findUniqueOrThrow({
      where: { id: sucursalId },
      select: { vitrinaDuracionSeg: true, vitrinaTransicion: true, vitrinaVersion: true },
    });
    return {
      duracionSeg: sucursal.vitrinaDuracionSeg,
      transicion: normalizarTransicion(sucursal.vitrinaTransicion),
      version: sucursal.vitrinaVersion,
    };
  }

  async guardarAjustes(sucursalId: string, ajustes: { duracionSeg: number; transicion: TransicionVitrina }): Promise<AjustesVitrina> {
    const sucursal = await this.prisma.sucursal.update({
      where: { id: sucursalId },
      data: { vitrinaDuracionSeg: ajustes.duracionSeg, vitrinaTransicion: ajustes.transicion, ...subirVersion },
      select: { vitrinaDuracionSeg: true, vitrinaTransicion: true, vitrinaVersion: true },
    });
    return {
      duracionSeg: sucursal.vitrinaDuracionSeg,
      transicion: normalizarTransicion(sucursal.vitrinaTransicion),
      version: sucursal.vitrinaVersion,
    };
  }
}

function normalizarTransicion(valor: string): TransicionVitrina {
  return (TRANSICIONES_VITRINA as readonly string[]).includes(valor) ? (valor as TransicionVitrina) : "FUNDIDO";
}
```

- [ ] **Step 6: Comprobar tipos y que los demás llamadores de `subir` siguen compilando**

Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

Expected: verde (`cacheControl` es opcional: `guardarImagen` de kiosko y `guardarFoto` de usuarios no cambian).

- [ ] **Step 7: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el repositorio de la vitrina y la subida prefirmada, inspección y borrado en R2
```

---

### Task 8: API del manifiesto y del flujo SSE

> **Precondición:** el usuario confirmó que la migración `20261015000000_vitrina` ya está aplicada en producción (Punto de control A, Deploy 1). Este paso consulta las tablas nuevas contra la base de producción: sin esa confirmación, **no empezar**. Todo se prueba en local (`web-admin` en `localhost:3000`), con la sede y la API key de `zip-gym`; no hay deploy en esta tarea.

**Files:**
- Modify: `apps/web-admin/lib/kiosco.ts` (exportar `CORS_HEADERS`; añadir `tasaBcvParaKiosco`)
- Modify: `apps/web-admin/app/api/kiosco/estado/route.ts` (usa `tasaBcvParaKiosco`)
- Create: `apps/web-admin/lib/vitrinaEventos.ts`
- Create: `apps/web-admin/app/api/kiosco/vitrina/route.ts`
- Create: `apps/web-admin/app/api/kiosco/vitrina/eventos/route.ts`

**Interfaces:**
- Consumes: `PrismaVitrinaRepository` (Task 7), `armarManifiesto` (Task 4), `crearEmisor` (Task 5), `orquestadorTasa` (existente).
- Produces: `tasaBcvParaKiosco(): Promise<{ valor: number; fecha: string } | null>` (`lib/kiosco`); `notificarCambioVitrina(sucursalId: string): void` y `emisorVitrina` (`lib/vitrinaEventos`); `GET /api/kiosco/vitrina` → `ManifiestoVitrina`; `GET /api/kiosco/vitrina/eventos` → `text/event-stream` (eventos `vitrina:cambio`, comentarios `: latido` cada 25 s).

- [ ] **Step 1: `lib/kiosco.ts`, exportar CORS y extraer la tasa**

En `apps/web-admin/lib/kiosco.ts`: cambiar `const CORS_HEADERS` por `export const CORS_HEADERS`, añadir los imports `import { orquestadorTasa } from "@/lib/tasaBcv";` y `import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";` y, al final del archivo:

```ts
// Última tasa BCV para las pantallas del kiosco y de la vitrina, con la misma forma en ambas. Sin tasa guardada
// devuelve null (las pantallas se ven igual, sin ese dato).
export async function tasaBcvParaKiosco(): Promise<{ valor: number; fecha: string } | null> {
  try {
    const { tasa } = await orquestadorTasa.obtenerTasaVigenteFresca();
    return { valor: tasa.valor, fecha: tasa.fecha.toISOString() };
  } catch (error) {
    if (!(error instanceof SinTasaDisponibleError)) console.error("Error al leer la tasa para el kiosco:", error);
    return null;
  }
}
```

- [ ] **Step 2: `estado/route.ts` reutiliza el helper (mismo comportamiento)**

Reemplazar su contenido por:

```ts
// GET /api/kiosco/estado — lo que el reposo del kiosco muestra: sede, última tasa BCV y la configuración
// del reposo (frases, imagen y opacidad) hecha desde el menú Kiosko del panel.
// Autenticado con la apiKey de la sucursal (ver lib/kiosco.ts).
import { NextRequest, NextResponse } from "next/server";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco, tasaBcvParaKiosco } from "@/lib/kiosco";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    return jsonKiosco(
      {
        sucursalNombre: sucursal.nombre,
        tasaBcv: await tasaBcvParaKiosco(),
        reposo: { frases: sucursal.reposoFrases, imagenUrl: sucursal.reposoImagenUrl, opacidad: sucursal.reposoOpacidad },
      },
      200
    );
  } catch (error) {
    console.error("Error en el estado del kiosco:", error);
    return jsonKiosco({ error: "Error interno al leer el estado del kiosco." }, 500);
  }
}
```

- [ ] **Step 3: Emisor compartido**

`apps/web-admin/lib/vitrinaEventos.ts`:

```ts
import { crearEmisor } from "@gym-app/domain/utils/emisorEventos";

// Un solo emisor por proceso: las Server Actions y las rutas SSE comparten globalThis aunque Next las empaquete
// por separado. Suficiente con un solo contenedor de web-admin.
const global = globalThis as unknown as { __emisorVitrina?: ReturnType<typeof crearEmisor> };
export const emisorVitrina = (global.__emisorVitrina ??= crearEmisor());

// Avisa a las TVs conectadas de esa sede. Llamarlo SIEMPRE después de que la escritura hizo commit.
export function notificarCambioVitrina(sucursalId: string): void {
  emisorVitrina.emitir(sucursalId, "vitrina:cambio");
}
```

- [ ] **Step 4: `GET /api/kiosco/vitrina`**

`apps/web-admin/app/api/kiosco/vitrina/route.ts`:

```ts
// GET /api/kiosco/vitrina — el manifiesto de la vitrina de TV: ítems activos no vencidos (los futuros incluidos),
// ajustes de la sede, la última tasa BCV (misma forma que /api/kiosco/estado) y la hora del servidor.
// Autenticado con la apiKey de la sucursal (ver lib/kiosco.ts).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco, tasaBcvParaKiosco } from "@/lib/kiosco";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { armarManifiesto } from "@gym-app/domain/services/manifiestoVitrina";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    const repositorio = new PrismaVitrinaRepository(prisma);
    const [items, ajustes, tasaBcv] = await Promise.all([
      repositorio.listar(sucursal.id),
      repositorio.obtenerAjustes(sucursal.id),
      tasaBcvParaKiosco(),
    ]);

    return jsonKiosco(armarManifiesto({ items, ajustes, tasaBcv, ahora: new Date() }), 200);
  } catch (error) {
    console.error("Error en el manifiesto de la vitrina:", error);
    return jsonKiosco({ error: "Error interno al leer la vitrina." }, 500);
  }
}
```

- [ ] **Step 5: `GET /api/kiosco/vitrina/eventos` (SSE)**

`apps/web-admin/app/api/kiosco/vitrina/eventos/route.ts`:

```ts
// GET /api/kiosco/vitrina/eventos — flujo SSE: avisa a la TV de cada cambio hecho en el panel (`vitrina:cambio`)
// y manda un latido cada 25 s para que el proxy no cierre la conexión. La TV pide el manifiesto al recibir el aviso.
import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, opcionesKiosco, sucursalDeKiosco } from "@/lib/kiosco";
import { emisorVitrina } from "@/lib/vitrinaEventos";

export const dynamic = "force-dynamic";

const LATIDO_MS = 25_000;

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  const sucursal = await sucursalDeKiosco(req);
  if (sucursal instanceof NextResponse) return sucursal;

  const codificador = new TextEncoder();
  let cerrar = () => {};

  const flujo = new ReadableStream<Uint8Array>({
    start(controlador) {
      const enviar = (texto: string) => {
        try {
          controlador.enqueue(codificador.encode(texto));
        } catch {
          cerrar();
        }
      };
      enviar(": conectado\n\n");
      const baja = emisorVitrina.suscribir(sucursal.id, (evento) => enviar(`event: ${evento}\ndata: ${Date.now()}\n\n`));
      const latido = setInterval(() => enviar(": latido\n\n"), LATIDO_MS);
      cerrar = () => {
        clearInterval(latido);
        baja();
        try {
          controlador.close();
        } catch {
          // ya estaba cerrado
        }
      };
      req.signal.addEventListener("abort", cerrar);
    },
    cancel() {
      cerrar();
    },
  });

  return new NextResponse(flujo, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 6: Verificar a mano en el servicio de pruebas (punto de verificación V1; la API no tiene tests automatizados)**

No se levanta nada en local. Con el código ya subido por el usuario a `vitrina` y desplegado en el servicio `gym-app-vitrina` de EasyPanel (ver "Entorno de pruebas"), con la API key de la sucursal de **zip-gym** (Configuraciones → Sucursales → "API Key del kiosco"; nunca la de `gym-demo`) y `BASE=https://<dominio-de-gym-app-vitrina>`. Ese web-admin usa la base de producción: **no crear ni modificar nada fuera de la organización `zip-gym`**.

```bash
curl -i $BASE/api/kiosco/vitrina                                   # 401, "Falta el header X-Kiosk-Api-Key."
curl -s $BASE/api/kiosco/vitrina -H "X-Kiosk-Api-Key: <CLAVE>"     # JSON: version, servidorAhora, duracionSeg, transicion, tasaBcv {valor, fecha}, items []
curl -s $BASE/api/kiosco/estado  -H "X-Kiosk-Api-Key: <CLAVE>"     # sigue funcionando, con la misma tasaBcv
curl -N $BASE/api/kiosco/vitrina/eventos -H "X-Kiosk-Api-Key: <CLAVE>"   # imprime ": conectado" y, a los 25 s, ": latido"
```

Expected: como se indica en cada línea; el `-N` queda abierto hasta Ctrl+C. Si el proxy de EasyPanel bufferiza el flujo y no llega ni `: conectado`, revisar que la respuesta lleve `X-Accel-Buffering: no` y `Cache-Control: no-cache, no-transform`. Si la respuesta es un error 500 por "tabla VitrinaItem inexistente", la migración no está aplicada en la base: detenerse y avisar al usuario.

**Aviso de cambios:** el emisor de eventos vive en la memoria de cada proceso, así que el `curl -N` y cualquier cambio hecho desde el dashboard solo se ven entre sí si **los dos apuntan al mismo servicio** (`gym-app-vitrina`). El dashboard de producción no avisará a este `curl`. Esa comprobación se hace en la Task 10 (Step 7, punto 7).

- [ ] **Step 7: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el manifiesto de la vitrina y el flujo SSE de avisos, y comparte la tasa con el kiosco
```

---

### Task 9: Dashboard, acciones del servidor, menú y vista Secuencia

**Files:**
- Create: `apps/web-admin/lib/vitrinaMedios.ts`
- Create: `apps/web-admin/app/(panel)/vitrina/{actions.ts,slugs.ts,tabs.ts,layout.tsx,page.tsx}`
- Create: `apps/web-admin/app/(panel)/vitrina/FilaVitrina.tsx`
- Create: `apps/web-admin/app/(panel)/vitrina/secuencia/page.tsx`
- Modify: `apps/web-admin/app/(panel)/layout.tsx`, `apps/web-admin/app/(panel)/MasSheet.tsx`
- Modify: `apps/web-admin/app/(panel)/miembros/comprimirImagen.ts` (exportar `canvasABlob`)

**Interfaces:**
- Consumes: `PrismaVitrinaRepository`, `IArchivoStorageService` (Task 7), `notificarCambioVitrina` (Task 8), `validarVitrinaItem`, `numeroOpcional` (Task 4), `rangoDiaCaracas` (Task 2), `MAX_BYTES_VIDEO_VITRINA`, `extensionDeImagen`, `MAX_BYTES_IMAGEN_VITRINA` (Task 5), `construirSecuencia`, `numeroDeDiapositiva`, `estadoVisibilidad` (Task 3).
- Produces (`vitrina/actions.ts`, todas `"use server"`): `prepararSubidaVideoAction(bytes: number): Promise<{ error?: string; subida?: SubidaPrefirmada }>`, `subirImagenVitrinaAction(formData): Promise<{ url?: string; error?: string }>` (campo `archivo`), `guardarItemAction(_prev: EstadoFormularioVitrina, formData): Promise<EstadoFormularioVitrina>`, `alternarActivoAction(formData)`, `moverItemAction(formData)`, `eliminarItemAction(formData)`, `guardarAjustesVitrinaAction(_prev, formData)`; `EstadoFormularioVitrina = { error?: string }`.
- Produces (`vitrina/slugs.ts`): `SLUG_DE_TIPO`, `TITULO_DE_TIPO`, `tipoDeSlug(slug): TipoVitrinaItem | null`.
- Produces (`lib/vitrinaMedios.ts`): `CARPETA_VITRINA = "vitrina"`, `CACHE_CONTROL_INMUTABLE`, `esUrlDeVitrina(url): boolean`.

- [ ] **Step 1: Helpers de medios y slugs**

`apps/web-admin/lib/vitrinaMedios.ts`:

```ts
export const CARPETA_VITRINA = "vitrina";
// Los nombres de objeto llevan un UUID nuevo en cada subida: una URL ya vista nunca cambia de contenido.
export const CACHE_CONTROL_INMUTABLE = "public, max-age=31536000, immutable";

// ¿La URL es de un archivo de la vitrina en nuestro bucket? Impide guardar o borrar URLs ajenas.
export function esUrlDeVitrina(url: string): boolean {
  const base = process.env.R2_PUBLIC_URL;
  return !!base && url.startsWith(`${base}/${CARPETA_VITRINA}/`);
}
```

`apps/web-admin/app/(panel)/vitrina/slugs.ts`:

```ts
import type { TipoVitrinaItem } from "@gym-app/domain/entities/Vitrina";

export const SLUG_DE_TIPO: Record<TipoVitrinaItem, string> = {
  ENTRENADOR: "entrenadores",
  PROMO: "promos",
  PRODUCTO: "productos",
};

export const TITULO_DE_TIPO: Record<TipoVitrinaItem, string> = {
  ENTRENADOR: "Entrenador",
  PROMO: "Promo",
  PRODUCTO: "Producto",
};

export function tipoDeSlug(slug: string): TipoVitrinaItem | null {
  const entrada = Object.entries(SLUG_DE_TIPO).find(([, valor]) => valor === slug);
  return entrada ? (entrada[0] as TipoVitrinaItem) : null;
}
```

En `apps/web-admin/app/(panel)/miembros/comprimirImagen.ts` cambiar `function canvasABlob(` por `export function canvasABlob(` (la usa el selector de medios).

- [ ] **Step 2: Acciones del servidor**

`apps/web-admin/app/(panel)/vitrina/actions.ts`:

```ts
"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { storageR2 } from "@/lib/storageR2";
import { notificarCambioVitrina } from "@/lib/vitrinaEventos";
import { CACHE_CONTROL_INMUTABLE, CARPETA_VITRINA, esUrlDeVitrina } from "@/lib/vitrinaMedios";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { TRANSICIONES_VITRINA, type DatosVitrinaItem, type VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { SubidaPrefirmada } from "@gym-app/domain/ports/IArchivoStorageService";
import { rangoDiaCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { extensionDeImagen, MAX_BYTES_IMAGEN_VITRINA } from "@gym-app/domain/utils/imagenSubida";
import { MAX_BYTES_VIDEO_VITRINA } from "@gym-app/domain/utils/videoVitrina";
import { DURACION_MAX_SEG, DURACION_MIN_SEG, numeroOpcional, validarVitrinaItem } from "@gym-app/domain/utils/vitrinaItem";
import { conMensajeOk } from "../redirectConMensaje";
import { SLUG_DE_TIPO } from "./slugs";

export interface EstadoFormularioVitrina {
  error?: string;
}

const SIN_PERMISO = "Solo el socio o el gerente pueden administrar la vitrina.";

// Sesión válida con permiso (mismo criterio que Kiosko); sin sesión redirige al login, sin permiso devuelve null.
async function sesionConPermiso() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  return puedeEditarKiosko(sesion.usuario.rol) ? sesion : null;
}

const repositorio = () => new PrismaVitrinaRepository(prisma);
const marcada = (formData: FormData, nombre: string) => formData.get(nombre) === "on";
const textoOpcional = (valor: FormDataEntryValue | null): string | null => valor?.toString().trim() || null;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerDatos(formData: FormData): { datos: DatosVitrinaItem } | { error: string } {
  const tipo = formData.get("tipo")?.toString();
  if (tipo !== "ENTRENADOR" && tipo !== "PROMO" && tipo !== "PRODUCTO") return { error: "Tipo de ítem no válido." };
  const mediaTipo = formData.get("mediaTipo")?.toString();
  if (mediaTipo !== "IMAGEN" && mediaTipo !== "VIDEO") return { error: "Falta subir la imagen o el video." };

  const inicio = textoOpcional(formData.get("inicio"));
  const fin = textoOpcional(formData.get("fin"));
  if ((inicio && !FECHA.test(inicio)) || (fin && !FECHA.test(fin))) return { error: "Fecha no válida." };

  return {
    datos: {
      tipo,
      mediaTipo,
      mediaUrl: textoOpcional(formData.get("mediaUrl")) ?? "",
      posterUrl: textoOpcional(formData.get("posterUrl")),
      duracionSeg: numeroOpcional(formData.get("duracionSeg")),
      inicio: inicio ? rangoDiaCaracas(inicio).inicio : null,
      fin: fin ? rangoDiaCaracas(fin).fin : null,
      precioUSD: numeroOpcional(formData.get("precioUSD")),
      ofertaUSD: numeroOpcional(formData.get("ofertaUSD")),
      descuentoPct: numeroOpcional(formData.get("descuentoPct")),
      etiqueta: textoOpcional(formData.get("etiqueta")),
      mostrarPrecio: marcada(formData, "mostrarPrecio"),
      mostrarOferta: marcada(formData, "mostrarOferta"),
      mostrarDescuento: marcada(formData, "mostrarDescuento"),
      mostrarEtiqueta: marcada(formData, "mostrarEtiqueta"),
      mostrarEquivalenteBs: marcada(formData, "mostrarEquivalenteBs"),
      nombre: textoOpcional(formData.get("nombre")),
      especialidad: textoOpcional(formData.get("especialidad")),
      frase: textoOpcional(formData.get("frase")),
      mostrarMedio: marcada(formData, "mostrarMedio"),
      mostrarNombre: marcada(formData, "mostrarNombre"),
      mostrarEspecialidad: marcada(formData, "mostrarEspecialidad"),
      mostrarFrase: marcada(formData, "mostrarFrase"),
    },
  };
}

// Borra de R2 los archivos de `anterior` que `nuevos` ya no usa (o todos, si no hay `nuevos`). Un fallo al borrar
// no debe romper el guardado: solo deja un archivo huérfano.
async function borrarArchivosSobrantes(anterior: VitrinaItem, nuevos?: DatosVitrinaItem) {
  const conservar = new Set([nuevos?.mediaUrl, nuevos?.posterUrl].filter(Boolean));
  for (const url of [anterior.mediaUrl, anterior.posterUrl]) {
    if (!url || conservar.has(url) || !esUrlDeVitrina(url)) continue;
    await storageR2().eliminar(url).catch((error) => console.error("No se pudo borrar de R2:", url, error));
  }
}

// El navegador sube los videos directo a R2: aquí solo se firma la URL (el tamaño se revalida al guardar).
export async function prepararSubidaVideoAction(bytes: number): Promise<{ error?: string; subida?: SubidaPrefirmada }> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES_VIDEO_VITRINA) return { error: "El video pesa más de 100 MB." };

  const subida = await storageR2().urlPrefirmada(CARPETA_VITRINA, `${randomUUID()}.mp4`, "video/mp4", CACHE_CONTROL_INMUTABLE);
  return { subida };
}

// Fotos, carteles y pósters: el navegador ya los comprimió (≤1920 px, WebP); aquí se valida y se suben a R2.
export async function subirImagenVitrinaAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "No se recibió la imagen." };
  const extension = extensionDeImagen(archivo.type, archivo.size, MAX_BYTES_IMAGEN_VITRINA);
  if (!extension) return { error: "La imagen debe ser JPG, PNG o WebP de hasta 8 MB." };

  const url = await storageR2().subir(
    CARPETA_VITRINA,
    `${randomUUID()}.${extension}`,
    Buffer.from(await archivo.arrayBuffer()),
    archivo.type,
    CACHE_CONTROL_INMUTABLE
  );
  return { url };
}

export async function guardarItemAction(_estadoPrevio: EstadoFormularioVitrina, formData: FormData): Promise<EstadoFormularioVitrina> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };
  const sucursalId = sesion.sucursalActivaId;

  const leido = leerDatos(formData);
  if ("error" in leido) return { error: leido.error };
  const { datos } = leido;

  const error = validarVitrinaItem(datos);
  if (error) return { error };

  const urls = [datos.mediaUrl, datos.posterUrl].filter((url): url is string => !!url);
  if (urls.some((url) => !esUrlDeVitrina(url))) return { error: "El archivo no está en el almacenamiento de la vitrina." };

  if (datos.mediaTipo === "VIDEO") {
    // La subida fue directa a R2: se comprueba que llegó completa y con el tipo esperado antes de publicarla.
    const real = await storageR2().inspeccionar(datos.mediaUrl);
    if (!real || real.bytes > MAX_BYTES_VIDEO_VITRINA || real.contentType !== "video/mp4") {
      await storageR2().eliminar(datos.mediaUrl).catch(() => {});
      return { error: "El video no se subió completo o no cumple el formato. Vuelve a subirlo." };
    }
  }

  const id = formData.get("id")?.toString();
  if (id) {
    const anterior = await repositorio().buscar(sucursalId, id);
    if (!anterior) return { error: "No se encontró el ítem." };
    await repositorio().actualizar(sucursalId, id, datos);
    await borrarArchivosSobrantes(anterior, datos);
  } else {
    await repositorio().crear(sucursalId, datos);
  }

  notificarCambioVitrina(sucursalId); // después del commit: el repositorio resuelve tras la transacción
  revalidatePath("/vitrina", "layout");
  redirect(
    conMensajeOk(
      `/vitrina/${SLUG_DE_TIPO[datos.tipo]}`,
      id ? "Cambios guardados." : "Creado. Está inactivo: actívalo para mostrarlo en la TV."
    )
  );
}

export async function alternarActivoAction(formData: FormData): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) return;
  const id = formData.get("id")?.toString();
  if (!id) return;

  const actualizado = await repositorio().actualizar(sesion.sucursalActivaId, id, { activo: formData.get("activo") === "true" });
  if (actualizado) notificarCambioVitrina(sesion.sucursalActivaId);
  revalidatePath("/vitrina", "layout");
}

export async function moverItemAction(formData: FormData): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) return;
  const id = formData.get("id")?.toString();
  const direccion = formData.get("direccion")?.toString();
  if (!id || (direccion !== "SUBIR" && direccion !== "BAJAR")) return;

  const movido = await repositorio().mover(sesion.sucursalActivaId, id, direccion);
  if (movido) notificarCambioVitrina(sesion.sucursalActivaId);
  revalidatePath("/vitrina", "layout");
}

export async function eliminarItemAction(formData: FormData): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) redirect("/miembros");
  const id = formData.get("id")?.toString();
  const volver = formData.get("volver")?.toString() ?? "";
  const destino = /^\/vitrina(\/[a-z]+)?$/.test(volver) ? volver : "/vitrina/secuencia";

  const borrado = id ? await repositorio().eliminar(sesion.sucursalActivaId, id) : null;
  if (borrado) {
    await borrarArchivosSobrantes(borrado);
    notificarCambioVitrina(sesion.sucursalActivaId);
  }
  revalidatePath("/vitrina", "layout");
  redirect(conMensajeOk(destino, "Eliminado."));
}

export async function guardarAjustesVitrinaAction(
  _estadoPrevio: EstadoFormularioVitrina,
  formData: FormData
): Promise<EstadoFormularioVitrina> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const duracionSeg = numeroOpcional(formData.get("duracionSeg"));
  if (duracionSeg === null || !Number.isInteger(duracionSeg) || duracionSeg < DURACION_MIN_SEG || duracionSeg > DURACION_MAX_SEG) {
    return { error: `La duración debe ser un número entero entre ${DURACION_MIN_SEG} y ${DURACION_MAX_SEG} segundos.` };
  }
  const transicion = formData.get("transicion")?.toString();
  if (!TRANSICIONES_VITRINA.some((t) => t === transicion)) return { error: "Estilo de transición no válido." };

  await repositorio().guardarAjustes(sesion.sucursalActivaId, {
    duracionSeg,
    transicion: transicion as (typeof TRANSICIONES_VITRINA)[number],
  });
  notificarCambioVitrina(sesion.sucursalActivaId);
  revalidatePath("/vitrina", "layout");
  redirect(conMensajeOk("/vitrina/ajustes", "Ajustes guardados."));
}
```

- [ ] **Step 3: Pestañas, layout y redirección**

`apps/web-admin/app/(panel)/vitrina/tabs.ts`:

```ts
export const TABS_VITRINA = [
  { href: "/vitrina/secuencia", label: "Secuencia" },
  { href: "/vitrina/entrenadores", label: "Entrenadores" },
  { href: "/vitrina/promos", label: "Promos" },
  { href: "/vitrina/productos", label: "Productos" },
  { href: "/vitrina/ajustes", label: "Ajustes" },
];
```

`apps/web-admin/app/(panel)/vitrina/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { TabsConfiguraciones } from "../configuraciones/TabsConfiguraciones";
import { TABS_VITRINA } from "./tabs";

export default async function LayoutVitrina({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!puedeEditarKiosko(sesion.usuario.rol)) redirect("/miembros");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Vitrina</PageHeader>
      </div>

      <TabsConfiguraciones tabs={TABS_VITRINA} />

      {children}
    </div>
  );
}
```

`apps/web-admin/app/(panel)/vitrina/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function PaginaVitrina() {
  redirect("/vitrina/secuencia");
}
```

- [ ] **Step 4: Menú**

En `apps/web-admin/app/(panel)/layout.tsx`, justo debajo de la línea de Kiosko (≈ línea 59) añadir:

```tsx
              ...(puedeEditarKiosko(usuario.rol) ? [{ href: "/vitrina", label: "Vitrina" }] : []),
```

En `apps/web-admin/app/(panel)/MasSheet.tsx`, justo debajo de la línea 29 (`...(puedeEditarKiosko(rol) ? [{ href: "/kiosko", label: "Kiosko" }] : []),`) añadir:

```tsx
    ...(puedeEditarKiosko(rol) ? [{ href: "/vitrina", label: "Vitrina" }] : []),
```

- [ ] **Step 5: Fila de ítem (reutilizada por Secuencia y por cada pestaña)**

`apps/web-admin/app/(panel)/vitrina/FilaVitrina.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { estadoVisibilidad } from "@gym-app/domain/services/secuenciaVitrina";
import { alternarActivoAction, moverItemAction } from "./actions";
import { SLUG_DE_TIPO, TITULO_DE_TIPO } from "./slugs";

const ESTADO: Record<ReturnType<typeof estadoVisibilidad>, { texto: string; color: string }> = {
  EN_PANTALLA: { texto: "En la TV", color: "var(--gx-good)" },
  PROGRAMADO: { texto: "Programado", color: "var(--gx-warn)" },
  VENCIDO: { texto: "Vencido", color: "var(--gx-bad)" },
  INACTIVO: { texto: "Inactivo", color: "var(--gx-muted)" },
};

export function FilaVitrina({
  item,
  ahora,
  numeroDiapositiva,
  mover,
}: {
  item: VitrinaItem;
  ahora: Date;
  numeroDiapositiva?: number;
  mover?: { puedeSubir: boolean; puedeBajar: boolean };
}) {
  const estado = ESTADO[estadoVisibilidad(item, ahora)];
  const titulo = item.nombre || item.etiqueta || TITULO_DE_TIPO[item.tipo];
  const miniatura = item.mediaTipo === "VIDEO" ? item.posterUrl : item.mediaUrl;

  return (
    <Card className="flex items-center gap-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--gx-surface-2)" }}>
        {miniatura && (
          // eslint-disable-next-line @next/next/no-img-element -- imagen en R2 (dominio externo)
          <img src={miniatura} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
          {titulo}
        </p>
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          {TITULO_DE_TIPO[item.tipo]} · {item.mediaTipo === "VIDEO" ? "Video" : "Imagen"}
          {numeroDiapositiva ? ` · Diapositiva ${numeroDiapositiva}` : ""}
        </p>
        <p className="text-sm font-medium" style={{ color: estado.color }}>
          {estado.texto}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {mover && (
          <>
            <form action={moverItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="direccion" value="SUBIR" />
              <Button type="submit" variant="secundario" disabled={!mover.puedeSubir} aria-label="Subir en la secuencia">
                ↑
              </Button>
            </form>
            <form action={moverItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="direccion" value="BAJAR" />
              <Button type="submit" variant="secundario" disabled={!mover.puedeBajar} aria-label="Bajar en la secuencia">
                ↓
              </Button>
            </form>
          </>
        )}
        <form action={alternarActivoAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="activo" value={item.activo ? "false" : "true"} />
          <Button type="submit" variant={item.activo ? "secundario" : "primario"}>
            {item.activo ? "Quitar de la TV" : "Mostrar en la TV"}
          </Button>
        </form>
        <Link
          href={`/vitrina/${SLUG_DE_TIPO[item.tipo]}/${item.id}`}
          className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold"
          style={{ borderColor: "var(--gx-field-edge)", color: "var(--gx-ink)" }}
        >
          Editar
        </Link>
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: Vista Secuencia**

`apps/web-admin/app/(panel)/vitrina/secuencia/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { construirSecuencia, numeroDeDiapositiva } from "@gym-app/domain/services/secuenciaVitrina";
import { FilaVitrina } from "../FilaVitrina";

export default async function PaginaSecuencia() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  const repositorio = new PrismaVitrinaRepository(prisma);
  const [items, ajustes] = await Promise.all([
    repositorio.listar(sesion.sucursalActivaId),
    repositorio.obtenerAjustes(sesion.sucursalActivaId),
  ]);
  const ahora = new Date();
  const numeros = numeroDeDiapositiva(construirSecuencia(items, ahora, ajustes.duracionSeg));

  return (
    <div className="flex max-w-4xl flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Orden en que se muestra todo en la TV. Los entrenadores que quedan seguidos comparten diapositiva (hasta 3 por franja);
        una promo o un producto entre dos entrenadores los separa. Los cambios llegan a la TV en segundos.
      </p>

      {items.length === 0 ? (
        <Card>
          <p style={{ color: "var(--gx-muted)" }}>Aún no hay nada en la vitrina. Crea un entrenador, una promo o un producto desde las pestañas.</p>
        </Card>
      ) : (
        items.map((item, i) => (
          <FilaVitrina
            key={item.id}
            item={item}
            ahora={ahora}
            numeroDiapositiva={numeros.get(item.id)}
            mover={{ puedeSubir: i > 0, puedeBajar: i < items.length - 1 }}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verificar**

Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

Expected: verde. En el punto de verificación V1, abrir `https://<dominio-de-gym-app-vitrina>/vitrina` con la sesión de la organización **zip-gym**: aparece "Vitrina" en el menú y la vista Secuencia vacía.

- [ ] **Step 8: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el menú Vitrina con la vista Secuencia y las acciones del servidor
```

---

### Task 10: Dashboard, formularios, subida de medios y ajustes

**Files:**
- Create: `apps/web-admin/app/(panel)/vitrina/medios.ts` (helpers del navegador)
- Create: `apps/web-admin/app/(panel)/vitrina/SelectorMedio.tsx`
- Create: `apps/web-admin/app/(panel)/vitrina/FormularioVitrinaItem.tsx`
- Create: `apps/web-admin/app/(panel)/vitrina/BotonEliminarItem.tsx`
- Create: `apps/web-admin/app/(panel)/vitrina/[tipo]/page.tsx`, `[tipo]/nuevo/page.tsx`, `[tipo]/[id]/page.tsx`
- Create: `apps/web-admin/app/(panel)/vitrina/ajustes/page.tsx`, `ajustes/FormularioAjustesVitrina.tsx`
- Create: `docs/superpowers/plans/2026-10-15-vitrina-tv-cors-r2.md` (guía del paso manual en Cloudflare)

**Interfaces:**
- Consumes: acciones y `slugs` (Task 9); `analizarMp4`, `ErrorMp4`, `LectorBytes` (Task 5, vía `@gym-app/domain/utils/mp4`); `validarVideo`; `MAX_LADO_IMAGEN_VITRINA`; `canvasABlob` (Task 9); `PrismaEntrenadorRepository.listarPorOrganizacionYSucursal` (existente, solo para copiar el nombre).
- Produces: `comprimirParaVitrina(archivo: File): Promise<File>`, `posterDeVideo(archivo: File): Promise<File>`, `lectorDeArchivo(archivo: Blob): LectorBytes`, `subirConProgreso(url, archivo, cabeceras, alProgreso): Promise<void>` (`medios.ts`); componente `SelectorMedio({ tipoItem, inicial? })` que escribe los campos ocultos `mediaUrl`, `mediaTipo`, `posterUrl`.

- [ ] **Step 1: Helpers del navegador**

`apps/web-admin/app/(panel)/vitrina/medios.ts`:

```ts
import type { LectorBytes } from "@gym-app/domain/utils/mp4";
import { MAX_LADO_IMAGEN_VITRINA } from "@gym-app/domain/utils/imagenSubida";
import { canvasABlob } from "../miembros/comprimirImagen";

function lienzo(ancho: number, alto: number): HTMLCanvasElement {
  const escala = Math.min(1, MAX_LADO_IMAGEN_VITRINA / Math.max(ancho, alto));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  return canvas;
}

async function aArchivo(canvas: HTMLCanvasElement, tipos: Array<[string, string, number]>): Promise<File> {
  for (const [mime, nombre, calidad] of tipos) {
    const blob = await canvasABlob(canvas, mime, calidad);
    if (blob && blob.type === mime) return new File([blob], nombre, { type: mime });
  }
  throw new Error("No se pudo procesar la imagen.");
}

// Carteles y fotos de la vitrina: lado mayor ≤ 1920 px y WebP 0.85 (JPEG de respaldo). No se usa comprimirAvatar
// (reduce a 384x384): un cartel de TV necesita su resolución.
export async function comprimirParaVitrina(archivo: File): Promise<File> {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const canvas = lienzo(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return aArchivo(canvas, [["image/webp", "imagen.webp", 0.85], ["image/jpeg", "imagen.jpg", 0.85]]);
}

// Primer fotograma del video, ya con la rotación aplicada (el <video> dibuja en la orientación mostrada).
export async function posterDeVideo(archivo: File): Promise<File> {
  const url = URL.createObjectURL(archivo);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((ok, mal) => {
      video.onloadeddata = () => ok();
      video.onerror = () => mal(new Error("El navegador no pudo leer el video."));
    });
    video.currentTime = 0.1;
    await new Promise<void>((ok) => {
      video.onseeked = () => ok();
    });
    const canvas = lienzo(video.videoWidth, video.videoHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await aArchivo(canvas, [["image/jpeg", "poster.jpg", 0.8]]);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Lector por rangos para analizarMp4: lee solo los trozos que pide, sin cargar el video entero.
export function lectorDeArchivo(archivo: Blob): LectorBytes {
  return async (desde, largo) => new Uint8Array(await archivo.slice(desde, desde + largo).arrayBuffer());
}

// PUT directo a R2 con las cabeceras firmadas (Content-Type y Cache-Control deben coincidir exactamente).
export function subirConProgreso(
  url: string,
  archivo: Blob,
  cabeceras: Record<string, string>,
  alProgreso: (fraccion: number) => void
): Promise<void> {
  return new Promise((ok, mal) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [nombre, valor] of Object.entries(cabeceras)) xhr.setRequestHeader(nombre, valor);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alProgreso(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? ok() : mal(new Error(`R2 respondió ${xhr.status}.`)));
    xhr.onerror = () => mal(new Error("No se pudo subir el video (¿falta el CORS del bucket de R2?)."));
    xhr.send(archivo);
  });
}
```

- [ ] **Step 2: Selector de medio**

`apps/web-admin/app/(panel)/vitrina/SelectorMedio.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { TipoMedio, TipoVitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { analizarMp4 } from "@gym-app/domain/utils/mp4";
import { validarVideo } from "@gym-app/domain/utils/videoVitrina";
import { prepararSubidaVideoAction, subirImagenVitrinaAction } from "./actions";
import { comprimirParaVitrina, lectorDeArchivo, posterDeVideo, subirConProgreso } from "./medios";

interface Medio {
  mediaUrl: string;
  mediaTipo: TipoMedio;
  posterUrl: string | null;
}

async function subirImagen(archivo: File): Promise<string> {
  const datos = new FormData();
  datos.set("archivo", archivo);
  const resultado = await subirImagenVitrinaAction(datos);
  if (!resultado.url) throw new Error(resultado.error ?? "No se pudo subir la imagen.");
  return resultado.url;
}

export function SelectorMedio({ tipoItem, inicial }: { tipoItem: TipoVitrinaItem; inicial?: Medio }) {
  const [medio, setMedio] = useState<Medio | null>(inicial ?? null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { mostrarError } = useFeedback();

  async function elegir(archivo: File) {
    setOcupado(true);
    setProgreso(null);
    try {
      if (archivo.type.startsWith("image/")) {
        setMedio({ mediaUrl: await subirImagen(await comprimirParaVitrina(archivo)), mediaTipo: "IMAGEN", posterUrl: null });
        return;
      }
      // Video: se valida antes de subir (la subida va directa a R2 y el servidor no lo ve).
      const info = await analizarMp4(lectorDeArchivo(archivo), archivo.size);
      const motivo = validarVideo(info, archivo.size, tipoItem === "ENTRENADOR");
      if (motivo) throw new Error(motivo);

      const posterUrl = await subirImagen(await posterDeVideo(archivo));
      const preparada = await prepararSubidaVideoAction(archivo.size);
      if (!preparada.subida) throw new Error(preparada.error ?? "No se pudo preparar la subida.");
      setProgreso(0);
      await subirConProgreso(preparada.subida.urlSubida, archivo, preparada.subida.cabeceras, setProgreso);
      setMedio({ mediaUrl: preparada.subida.urlPublica, mediaTipo: "VIDEO", posterUrl });
    } catch (error) {
      mostrarError(error instanceof Error ? error.message : "No se pudo subir el archivo.");
    } finally {
      setOcupado(false);
      setProgreso(null);
    }
  }

  const vista = medio?.mediaTipo === "VIDEO" ? medio.posterUrl : medio?.mediaUrl;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="mediaUrl" value={medio?.mediaUrl ?? ""} />
      <input type="hidden" name="mediaTipo" value={medio?.mediaTipo ?? ""} />
      <input type="hidden" name="posterUrl" value={medio?.posterUrl ?? ""} />

      <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
        {tipoItem === "ENTRENADOR" ? "Foto o video vertical (MP4 H.264)" : "Cartel: imagen o video (MP4 H.264)"}
      </span>

      {vista && (
        <div className="h-48 w-32 overflow-hidden rounded-lg border" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen en R2 (dominio externo) */}
          <img src={vista} alt="" className="h-full w-full object-contain" />
        </div>
      )}
      {medio?.mediaTipo === "VIDEO" && <p className="text-sm" style={{ color: "var(--gx-good)" }}>Video cargado.</p>}

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        disabled={ocupado}
        className="text-sm"
        style={{ color: "var(--gx-ink)" }}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void elegir(archivo);
          e.target.value = "";
        }}
      />
      {ocupado && (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          {progreso === null ? "Procesando…" : `Subiendo video… ${Math.round(progreso * 100)} %`}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Formulario de ítem**

`apps/web-admin/app/(panel)/vitrina/FormularioVitrinaItem.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { TipoVitrinaItem, VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { guardarItemAction } from "./actions";
import { SelectorMedio } from "./SelectorMedio";

const dia = (fecha: Date | null) => (fecha ? diaCalendarioCaracas(fecha).toISOString().slice(0, 10) : "");

function Interruptor({ nombre, etiqueta, marcado }: { nombre: string; etiqueta: string; marcado: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--gx-ink)" }}>
      <input type="checkbox" name={nombre} defaultChecked={marcado} className="h-5 w-5" style={{ accentColor: "var(--gx-accent)" }} />
      {etiqueta}
    </label>
  );
}

// `entrenadores` solo sirve para copiar un nombre al campo (la vitrina no queda vinculada a ningún usuario).
export function FormularioVitrinaItem({
  tipo,
  item,
  entrenadores = [],
}: {
  tipo: TipoVitrinaItem;
  item?: VitrinaItem;
  entrenadores?: { id: string; nombre: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(guardarItemAction, {});
  const { mostrarError } = useFeedback();
  const [nombre, setNombre] = useState(item?.nombre ?? "");

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error
  }, [estado.error]);

  const esEntrenador = tipo === "ENTRENADOR";

  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="tipo" value={tipo} />
      {item && <input type="hidden" name="id" value={item.id} />}

      <SelectorMedio
        tipoItem={tipo}
        inicial={item ? { mediaUrl: item.mediaUrl, mediaTipo: item.mediaTipo, posterUrl: item.posterUrl } : undefined}
      />

      {esEntrenador && entrenadores.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Copiar el nombre de un entrenador existente (opcional)
          <select
            className="gx-campo min-h-11 rounded-lg border px-3"
            defaultValue=""
            onChange={(e) => e.target.value && setNombre(e.target.value)}
          >
            <option value="">—</option>
            {entrenadores.map((e) => (
              <option key={e.id} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <Input
        label={esEntrenador ? "Nombre" : "Nombre (solo para identificarlo en el panel)"}
        name="nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        maxLength={60}
        required={esEntrenador}
      />

      {esEntrenador ? (
        <>
          <Input label="Especialidad" name="especialidad" defaultValue={item?.especialidad ?? ""} maxLength={60} />
          <Input label="Frase" name="frase" defaultValue={item?.frase ?? ""} maxLength={120} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm" style={{ color: "var(--gx-muted)" }}>Qué se muestra en la TV</legend>
            <Interruptor nombre="mostrarMedio" etiqueta="Foto o video" marcado={item?.mostrarMedio ?? true} />
            <Interruptor nombre="mostrarNombre" etiqueta="Nombre" marcado={item?.mostrarNombre ?? true} />
            <Interruptor nombre="mostrarEspecialidad" etiqueta="Especialidad" marcado={item?.mostrarEspecialidad ?? true} />
            <Interruptor nombre="mostrarFrase" etiqueta="Frase" marcado={item?.mostrarFrase ?? true} />
          </fieldset>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Precio (USD)" name="precioUSD" inputMode="decimal" defaultValue={item?.precioUSD ?? ""} />
            <Input label="Oferta (USD)" name="ofertaUSD" inputMode="decimal" defaultValue={item?.ofertaUSD ?? ""} />
            <Input label="Descuento (%)" name="descuentoPct" inputMode="numeric" defaultValue={item?.descuentoPct ?? ""} />
          </div>
          <Input label="Etiqueta (ej. NUEVO, 2x1)" name="etiqueta" defaultValue={item?.etiqueta ?? ""} maxLength={20} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm" style={{ color: "var(--gx-muted)" }}>Qué se muestra en la TV</legend>
            <Interruptor nombre="mostrarPrecio" etiqueta="Precio" marcado={item?.mostrarPrecio ?? true} />
            <Interruptor nombre="mostrarOferta" etiqueta="Oferta" marcado={item?.mostrarOferta ?? true} />
            <Interruptor nombre="mostrarDescuento" etiqueta="Descuento" marcado={item?.mostrarDescuento ?? true} />
            <Interruptor nombre="mostrarEtiqueta" etiqueta="Etiqueta" marcado={item?.mostrarEtiqueta ?? true} />
            <Interruptor nombre="mostrarEquivalenteBs" etiqueta="Equivalente en Bs (con la tasa BCV vigente)" marcado={item?.mostrarEquivalenteBs ?? true} />
          </fieldset>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Duración (segundos, vacío = la de la sede)" name="duracionSeg" inputMode="numeric" defaultValue={item?.duracionSeg ?? ""} />
        <Input label="Mostrar desde" name="inicio" type="date" defaultValue={dia(item?.inicio ?? null)} />
        <Input label="Mostrar hasta (incluido)" name="fin" type="date" defaultValue={dia(item?.fin ?? null)} />
      </div>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
```

`apps/web-admin/app/(panel)/vitrina/BotonEliminarItem.tsx`:

```tsx
"use client";

import { Button } from "@gym-app/ui/components/Button";
import { eliminarItemAction } from "./actions";

export function BotonEliminarItem({ id, volver }: { id: string; volver: string }) {
  return (
    <form
      action={eliminarItemAction}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este ítem? También se borra su archivo.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="volver" value={volver} />
      <Button type="submit" variant="peligro">
        Eliminar
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Páginas por tipo (lista, nuevo y edición)**

`apps/web-admin/app/(panel)/vitrina/[tipo]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { FilaVitrina } from "../FilaVitrina";
import { SLUG_DE_TIPO, TITULO_DE_TIPO, tipoDeSlug } from "../slugs";

export default async function PaginaListaVitrina({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo: slug } = await params;
  const tipo = tipoDeSlug(slug);
  if (!tipo) notFound();
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  const items = (await new PrismaVitrinaRepository(prisma).listar(sesion.sucursalActivaId)).filter((i) => i.tipo === tipo);
  const ahora = new Date();

  return (
    <div className="flex max-w-4xl flex-col gap-3">
      <div>
        <Link
          href={`/vitrina/${SLUG_DE_TIPO[tipo]}/nuevo`}
          className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold"
          style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
        >
          Nuevo {TITULO_DE_TIPO[tipo].toLowerCase()}
        </Link>
      </div>
      {items.length === 0 ? (
        <Card>
          <p style={{ color: "var(--gx-muted)" }}>Todavía no hay {slug}. Los nuevos nacen inactivos hasta que los actives.</p>
        </Card>
      ) : (
        items.map((item) => <FilaVitrina key={item.id} item={item} ahora={ahora} />)
      )}
    </div>
  );
}
```

`apps/web-admin/app/(panel)/vitrina/[tipo]/nuevo/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaEntrenadorRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEntrenadorRepository";
import { Card } from "@gym-app/ui/components/Card";
import { FormularioVitrinaItem } from "../../FormularioVitrinaItem";
import { tipoDeSlug } from "../../slugs";

export default async function PaginaNuevoVitrina({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo: slug } = await params;
  const tipo = tipoDeSlug(slug);
  if (!tipo) notFound();
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  const entrenadores =
    tipo === "ENTRENADOR"
      ? await new PrismaEntrenadorRepository(prisma).listarPorOrganizacionYSucursal(sesion.usuario.organizacionId, sesion.sucursalActivaId)
      : [];

  return (
    <Card className="max-w-3xl">
      <FormularioVitrinaItem tipo={tipo} entrenadores={entrenadores} />
    </Card>
  );
}
```

`apps/web-admin/app/(panel)/vitrina/[tipo]/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { BotonEliminarItem } from "../../BotonEliminarItem";
import { FormularioVitrinaItem } from "../../FormularioVitrinaItem";
import { SLUG_DE_TIPO, tipoDeSlug } from "../../slugs";

export default async function PaginaEditarVitrina({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo: slug, id } = await params;
  const tipo = tipoDeSlug(slug);
  if (!tipo) notFound();
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  const item = await new PrismaVitrinaRepository(prisma).buscar(sesion.sucursalActivaId, id);
  if (!item || item.tipo !== tipo) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <FormularioVitrinaItem key={item.id} tipo={tipo} item={item} />
      </Card>
      <BotonEliminarItem id={item.id} volver={`/vitrina/${SLUG_DE_TIPO[tipo]}`} />
    </div>
  );
}
```

- [ ] **Step 5: Ajustes**

`apps/web-admin/app/(panel)/vitrina/ajustes/FormularioAjustesVitrina.tsx`:

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { TRANSICIONES_VITRINA, type AjustesVitrina } from "@gym-app/domain/entities/Vitrina";
import { guardarAjustesVitrinaAction } from "../actions";

const NOMBRE_TRANSICION: Record<(typeof TRANSICIONES_VITRINA)[number], string> = {
  FUNDIDO: "Fundido",
  DESLIZAR: "Deslizar",
};

export function FormularioAjustesVitrina({ ajustes }: { ajustes: AjustesVitrina }) {
  const [estado, enviar, enviando] = useActionState(guardarAjustesVitrinaAction, {});
  const { mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error
  }, [estado.error]);

  return (
    <form action={enviar} className="flex max-w-md flex-col gap-5">
      <Input label="Duración por defecto de cada diapositiva (segundos)" name="duracionSeg" inputMode="numeric" defaultValue={ajustes.duracionSeg} required />
      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Transición entre diapositivas
        <select name="transicion" defaultValue={ajustes.transicion} className="gx-campo min-h-11 rounded-lg border px-3">
          {TRANSICIONES_VITRINA.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TRANSICION[t]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
```

`apps/web-admin/app/(panel)/vitrina/ajustes/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { FormularioAjustesVitrina } from "./FormularioAjustesVitrina";

export default async function PaginaAjustesVitrina() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  const ajustes = await new PrismaVitrinaRepository(prisma).obtenerAjustes(sesion.sucursalActivaId);
  return (
    <Card className="max-w-2xl">
      <FormularioAjustesVitrina key={`${ajustes.duracionSeg}|${ajustes.transicion}`} ajustes={ajustes} />
    </Card>
  );
}
```

- [ ] **Step 6: Guía del paso manual de CORS en R2**

`docs/superpowers/plans/2026-10-15-vitrina-tv-cors-r2.md`:

```markdown
# CORS del bucket de R2 para la vitrina

Los videos se suben directo del navegador al bucket `gym-app` con una URL prefirmada, así que el bucket necesita CORS
con PUT desde el origen de web-admin. Sin esto la subida falla con "¿falta el CORS del bucket de R2?".

Cloudflare → R2 → bucket `gym-app` → Settings → CORS policy → agregar:

    [
      {
        "AllowedOrigins": ["https://<dominio-de-web-admin-de-produccion>", "https://<dominio-de-gym-app-vitrina>"],
        "AllowedMethods": ["PUT"],
        "AllowedHeaders": ["Content-Type", "Cache-Control"],
        "MaxAgeSeconds": 3600
      }
    ]

Las lecturas (`<video>`, `<img>`, y la descarga nativa de la TV) no necesitan CORS.
```

- [ ] **Step 7: Verificación manual (organización `zip-gym`)**

Con el CORS del paso 6 ya configurado (incluye el dominio del servicio de pruebas) y el panel en `https://<dominio-de-gym-app-vitrina>` (el servicio de pruebas usa la base y el bucket de producción: **iniciar sesión con la organización `zip-gym` y trabajar solo en su sede**, nunca en `gym-demo`). Punto de verificación V1:

1. Entrenadores → Nuevo: subir una foto vertical (≥ 3000 px). Debe quedar en R2 (`vitrina/…webp`, ≤ 1920 px).
2. Subir un **video H.264** de más de 50 MB: barra de progreso, queda en R2 como `vitrina/…mp4` más su póster.
3. Subir un video **HEVC de iPhone**: se rechaza con el mensaje de "Más compatible".
4. Subir un video H.264 **con marca de rotación**: se acepta como vertical para un entrenador.
5. Guardar: el ítem nace **inactivo**; "Mostrar en la TV" lo activa; en Secuencia aparece con su número de diapositiva; ↑/↓ lo reordenan.
6. Editar y reemplazar el medio: el archivo anterior desaparece de R2. Eliminar el ítem: sus archivos desaparecen.
7. Con `curl -N https://<dominio-de-gym-app-vitrina>/api/kiosco/vitrina/eventos -H "X-Kiosk-Api-Key: <CLAVE de zip-gym>"` abierto contra **este mismo** servicio de pruebas (si el panel fuera el de producción, el aviso no llegaría: el emisor es en memoria por proceso): cada acción (activar, mover, guardar, eliminar, ajustes) imprime `event: vitrina:cambio`.
8. Ajustes: duración 2 → error; 15 → guarda.
9. Datos hostiles: oferta mayor que el precio, "abc" en precio, descuento 150, fechas invertidas → mensaje de error sin guardar.

- [ ] **Step 8: Tipos, lint y sugerir el commit**

Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega los formularios de la vitrina con subida de fotos y videos a R2 y la pestaña de ajustes
```

---

### Task 11: App de TV, andamiaje, configuración y excepción al ADR-001

**Files:**
- Create: `apps/vitrina/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,eslint.config.mjs,.gitignore}`
- Create: `apps/vitrina/app/{layout.tsx,globals.css,page.tsx}` (la página real llega en Task 13; aquí una pantalla de marca mínima)
- Create: `apps/vitrina/lib/config.ts`, `apps/vitrina/lib/config.test.ts`, `apps/vitrina/public/vitrina-config.ejemplo.json`
- Create: `apps/vitrina/Dockerfile`, `apps/vitrina/docker-entrypoint.sh` (vista previa estática en EasyPanel; el APK no los usa)
- Create: `docs/adr/ADR-002-vitrina-importa-dominio-puro.md`
- Modify: `turbo.json`
- Modify (regenera): `apps/vitrina/app/icon.png`, `apps/vitrina/app/apple-icon.png`, `apps/vitrina/public/branding/escudo.png` (vía `npm run iconos`)

**Interfaces:**
- Produces: `ConfigVitrina = { apiUrl: string; clave: string }`, `cargarConfig(): Promise<ConfigVitrina>` (`lib/config.ts`); workspace `vitrina` (puerto 3002); `turbo` task `vitrina#build` con salida `out/**`.

- [ ] **Step 1: ADR de la excepción**

`docs/adr/ADR-002-vitrina-importa-dominio-puro.md`:

```markdown
# ADR-002: la vitrina importa funciones puras de packages/domain

Estado: aceptado (2026-10-15). Complementa a ADR-001, que fija `apps/kiosk` como "cero lógica de negocio".

## Contexto
La vitrina de TV (`apps/vitrina`) corre sin depender de internet. Qué se muestra depende del reloj (`inicio`/`fin`
de cada ítem cambia las franjas de entrenadores) y de la tasa (si el Bs se oculta). Esa decisión se toma en la TV y
debe ser idéntica a la del panel y a la del manifiesto; duplicarla en la app sería una segunda fuente de verdad.

## Decisión
`apps/vitrina` importa de `packages/domain` solo funciones puras, por ruta (`@gym-app/domain/utils/...`,
`.../services/...`, `.../entities/...`): `construirSecuencia`, `estadoDeTasa`, `equivalenteBs`, `formatearBs`,
`instanteEfectivo`, `diaCalendarioCaracas`, `armarManifiesto`/`itemsDeManifiesto`/`urlsDeManifiesto`.
Nunca `@gym-app/infrastructure` ni `@gym-app/db`: lo hace cumplir la regla `no-restricted-imports` de su ESLint.
`@gym-app/domain` se agrega a `transpilePackages` de `apps/vitrina`.

## Consecuencias
- `apps/kiosk` no cambia y sigue sin importar el dominio.
- Un archivo de `packages/domain` que `apps/vitrina` importe no puede depender de Node, Prisma ni de la red.
```

- [ ] **Step 2: `package.json` y configuración de Next**

`apps/vitrina/package.json`:

```json
{
  "name": "vitrina",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "lint": "eslint",
    "test": "vitest run"
  },
  "dependencies": {
    "@capacitor/core": "^8.5.3",
    "@capacitor/file-transfer": "^2.0.6",
    "@capacitor/filesystem": "^8.1.4",
    "@gym-app/domain": "*",
    "@gym-app/theming": "*",
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
    "typescript": "^5",
    "vitest": "5.0.2"
  }
}
```

`apps/vitrina/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La vitrina se empaqueta dentro del APK (apps/vitrina-tv): HTML/JS/CSS estático, sin backend. Habla con
  // web-admin por HTTP (lib/api.ts). Importa solo funciones puras de @gym-app/domain (ADR-002).
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@gym-app/domain", "@gym-app/theming"],
};

export default nextConfig;
```

`apps/vitrina/tsconfig.json`: copia exacta de `apps/kiosk/tsconfig.json`. `apps/vitrina/postcss.config.mjs`: copia exacta de `apps/kiosk/postcss.config.mjs`.

`apps/vitrina/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ADR-002: del dominio solo funciones puras; nunca infraestructura ni base de datos.
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@gym-app/infrastructure*", "@gym-app/db*"], message: "La vitrina solo importa funciones puras de @gym-app/domain (ADR-002)." }] },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

`apps/vitrina/.gitignore`:

```text
public/vitrina-config.json
```

`apps/vitrina/public/vitrina-config.ejemplo.json`:

```json
{ "apiUrl": "http://localhost:3000", "clave": "<API key de la sede (Configuraciones → Sucursales)>" }
```

`turbo.json`: añadir, junto a `kiosk#build`:

```json
    "vitrina#build": {
      "dependsOn": ["^build"],
      "outputs": ["out/**", ".next/**", "!.next/cache/**"]
    },
```

- [ ] **Step 3: Configuración en tiempo de ejecución**

`apps/vitrina/lib/config.ts`:

```ts
export interface ConfigVitrina {
  apiUrl: string;
  clave: string;
}

// Clave de la sede en el fragmento de la URL (`#clave=<codificada>`): solo para la vista previa en navegador, donde la
// imagen estática no lleva clave. El fragmento no llega al servidor ni a sus logs.
export function claveDeFragmento(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("clave")?.trim() ?? "";
}

// La URL de web-admin y la clave de la sede las escribe apps/vitrina-tv/capacitor/scripts/preparar.mjs en
// vitrina-config.json dentro del bundle del APK. En la vista previa (apps/vitrina/Dockerfile) el contenedor escribe el
// archivo al arrancar con VITRINA_API_URL y clave vacía, y la clave se toma del fragmento.
export async function cargarConfig(): Promise<ConfigVitrina> {
  const respuesta = await fetch("/vitrina-config.json", { cache: "no-store" });
  if (!respuesta.ok) throw new Error("Falta vitrina-config.json en el bundle.");
  const datos: unknown = await respuesta.json();
  const { apiUrl, clave } = (datos ?? {}) as Partial<ConfigVitrina>;
  if (typeof apiUrl !== "string" || !apiUrl || typeof clave !== "string") throw new Error("vitrina-config.json no es válido.");
  return { apiUrl: apiUrl.replace(/\/+$/, ""), clave: clave || claveDeFragmento(window.location.hash) };
}
```

`apps/vitrina/lib/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { claveDeFragmento } from "./config";

describe("claveDeFragmento", () => {
  it("lee la clave del fragmento", () => {
    expect(claveDeFragmento("#clave=abc123")).toBe("abc123");
  });
  it("decodifica y recorta espacios", () => {
    expect(claveDeFragmento("#clave=%20a%2Bb%20")).toBe("a+b");
  });
  it("devuelve cadena vacía sin fragmento o sin clave", () => {
    expect(claveDeFragmento("")).toBe("");
    expect(claveDeFragmento("#otra=1")).toBe("");
    expect(claveDeFragmento("#clave=")).toBe("");
  });
});
```

- [ ] **Step 4: Layout, estilos y pantalla de marca mínima**

`apps/vitrina/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Barlow, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { ThemeStyleTag } from "@gym-app/theming/ThemeStyleTag";
import { temaAdrenalinaXtreme } from "@gym-app/theming/tokens";

// next/font descarga y empaqueta las fuentes en el build: la TV las tiene sin internet.
const titulo = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--fuente-titulo" });
const texto = Barlow({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--fuente-texto" });

export const metadata: Metadata = { title: "Vitrina" };
export const viewport: Viewport = { themeColor: temaAdrenalinaXtreme.ground };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full ${titulo.variable} ${texto.variable}`}>
      <body className="h-full overflow-hidden" style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}>
        <ThemeStyleTag tema={temaAdrenalinaXtreme} />
        {children}
      </body>
    </html>
  );
}
```

`apps/vitrina/app/globals.css`:

```css
@import "tailwindcss";

/* Todo se mide en rem: 16 px a 1920x1080, y escala solo en cualquier TV (mismo criterio que el kiosco). */
html {
  font-size: clamp(9px, min(0.8333vw, 1.5vh), 32px);
  cursor: none;
}

body {
  font-family: var(--fuente-texto), Arial, Helvetica, sans-serif;
}

.titulo {
  font-family: var(--fuente-titulo), Impact, sans-serif;
  letter-spacing: 0.02em;
}

/* Transiciones de entrada de cada diapositiva (solo opacity/transform). */
@keyframes entrada-fundido {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes entrada-deslizar {
  from { opacity: 0; transform: translateX(6%); }
  to { opacity: 1; transform: translateX(0); }
}
.trans-fundido { animation: entrada-fundido 700ms ease both; }
.trans-deslizar { animation: entrada-deslizar 700ms ease both; }
```

`apps/vitrina/app/page.tsx` (provisional; se reemplaza en la Task 13):

```tsx
export default function PaginaVitrina() {
  return (
    <main className="flex h-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- recurso local empaquetado */}
      <img src="/branding/escudo.png" alt="Adrenalina Xtreme Gym" className="h-[60vh]" />
    </main>
  );
}
```

- [ ] **Step 5: Actualizar el lock y generar los íconos web (sin instalar ni compilar en local)**

```bash
cd /c/dev/gym-app
npm install --package-lock-only --ignore-scripts
(cd apps/vitrina-tv/capacitor && npm run iconos)
```

Expected: `npm install --package-lock-only` solo reescribe `package-lock.json` con el workspace `vitrina` (no baja paquetes ni crea `node_modules`); `npm run iconos` ahora también escribe `apps/vitrina/app/icon.png`, `apple-icon.png` y `public/branding/escudo.png`. El build y el lint de `apps/vitrina` **no** se corren en local: los comprueban el workflow `verificar-vitrina.yml` y el build de Docker del Step 6. Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

- [ ] **Step 6: Dockerfile de la vista previa estática y comprobación de que no rompe los `npm ci` existentes**

`apps/vitrina/Dockerfile` (patrón de `apps/kiosk/Dockerfile`; contexto de build: la raíz del repo; la URL de la API es de **runtime**, no de build):

```dockerfile
# syntax=docker/dockerfile:1
# Vista previa en navegador de apps/vitrina (export estático, ver next.config.ts) para probar en EasyPanel.
# El APK NO usa este Dockerfile: lleva el export dentro del bundle (apps/vitrina-tv).
# Contexto de build requerido: la RAÍZ del repo (necesita el package-lock.json raíz para `npm ci`).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/vitrina/package.json apps/vitrina/package.json
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

COPY turbo.json turbo.json
COPY apps/vitrina apps/vitrina
# La vitrina importa código fuente de estos dos paquetes (ADR-002): arriba solo se copió su package.json.
COPY packages/domain packages/domain
COPY packages/theming packages/theming

RUN npx turbo run build --filter=vitrina

# ---- runner: sirve el export estático y escribe vitrina-config.json al arrancar -------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV TZ=America/Caracas

RUN npm install -g serve@14

COPY --from=builder /repo/apps/vitrina/out ./out
COPY apps/vitrina/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

`apps/vitrina/docker-entrypoint.sh`:

```sh
#!/bin/sh
# Escribe vitrina-config.json con la URL de web-admin y SIN clave: la clave de la sede se pasa en el navegador con
# #clave=<API key> (lib/config.ts), para que no quede dentro de la imagen ni en un archivo público.
set -e

case "$VITRINA_API_URL" in
  http://*|https://*) ;;
  *) echo "VITRINA_API_URL es obligatoria y debe empezar por http:// o https://"; exit 1 ;;
esac
URL="${VITRINA_API_URL%/}"
case "$URL" in
  *\"*|*\\*|*" "*) echo "VITRINA_API_URL contiene caracteres no válidos"; exit 1 ;;
esac

printf '{"apiUrl":"%s","clave":""}\n' "$URL" > out/vitrina-config.json
exec serve -s out -l 3000
```

**Comprobación de que el workspace nuevo no rompe los `npm ci` existentes (sin ejecutar nada en local):** el `Dockerfile` raíz **ya omite** `apps/kiosk` y `apps/worker` (workspaces presentes en el lock) y `apps/kiosk/Dockerfile` omite `apps/vitrina-tv`/`kiosk-host`, y ambos construyen hoy: `npm ci` tolera workspaces del lock cuyo `package.json` no se copia. `apps/vitrina` queda en la misma situación en esos dos Dockerfiles, así que **no se modifican**. La prueba real es el primer build de `gym-app-vitrina` en EasyPanel (Dockerfile raíz, rama `vitrina`) y el del propio `apps/vitrina/Dockerfile`: si alguno falla en `npm ci`, **detenerse y avisar** antes de seguir (un fallo igual tumbaría el Deploy 2). Tras el push, crear el servicio `gym-app-vitrina-tv` según "Entorno de pruebas".

- [ ] **Step 7: Sugerir el mensaje de commit**

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el andamiaje de la app de TV de la vitrina y la excepción al ADR-001
```

---

### Task 12: App de TV, almacén en disco, sincronización, SSE y hook principal

**Files:**
- Create: `apps/vitrina/lib/almacen.ts`, `apps/vitrina/lib/almacenDisco.ts`, `apps/vitrina/lib/almacenWeb.ts`
- Create: `apps/vitrina/lib/sincronizar.ts`, `apps/vitrina/lib/sincronizar.test.ts`
- Create: `apps/vitrina/lib/sse.ts`, `apps/vitrina/lib/sse.test.ts`
- Create: `apps/vitrina/lib/api.ts`, `apps/vitrina/lib/esperar.ts`
- Create: `apps/vitrina/lib/useVitrina.ts`

**Interfaces:**
- Consumes: `ManifiestoVitrina` (Task 3), `urlsDeManifiesto` (Task 4), `instanteEfectivo` (Task 2), `ConfigVitrina`/`cargarConfig` (Task 11).
- Produces: `interface Almacen { iniciar(): Promise<void>; rutaLocal(url: string): string | null; guardar(url: string): Promise<void>; eliminar(url: string): Promise<void>; listar(): Promise<string[]> }`; `crearAlmacen(): Almacen`; `sincronizar(manifiesto, almacen): Promise<{ completo: boolean; descargadas: string[]; eliminadas: string[]; fallidas: string[] }>`; `leerEventos(cuerpo: ReadableStream<Uint8Array>, alEvento: (nombre: string) => void): Promise<void>`; `pedirManifiesto(config, señal?)`, `abrirEventos(config, oyentes: { alAbrir(): void; alEvento(): void }, señal)`; `esperar(ms, señal): Promise<void>`; `useVitrina(): { manifiesto: ManifiestoVitrina | null; almacen: Almacen | null; ahora: Date }`.

- [ ] **Step 1: Pruebas que fallan**

`apps/vitrina/lib/sincronizar.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { itemDePrueba } from "@gym-app/domain/entities/vitrinaItemDePrueba";
import { armarManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import type { Almacen } from "./almacen";
import { sincronizar } from "./sincronizar";

function fakeAlmacen(inicial: string[] = [], fallan: string[] = []) {
  const guardadas = new Set(inicial);
  const llamadas: string[] = [];
  const almacen: Almacen & { guardadas: Set<string>; llamadas: string[] } = {
    guardadas,
    llamadas,
    async iniciar() {},
    rutaLocal: (url) => (guardadas.has(url) ? `local:${url}` : null),
    async guardar(url) {
      llamadas.push(`guardar:${url}`);
      if (fallan.includes(url)) throw new Error("sin red");
      guardadas.add(url);
    },
    async eliminar(url) {
      llamadas.push(`eliminar:${url}`);
      guardadas.delete(url);
    },
    async listar() {
      return [...guardadas];
    },
  };
  return almacen;
}

const manifiestoCon = (...urls: string[]) =>
  armarManifiesto({
    items: urls.map((mediaUrl, i) => itemDePrueba({ id: `i${i}`, orden: i, mediaUrl })),
    ajustes: { duracionSeg: 12, transicion: "FUNDIDO", version: 1 },
    tasaBcv: null,
    ahora: new Date("2026-10-15T16:00:00Z"),
  });

describe("sincronizar", () => {
  test("descarga solo lo que falta", async () => {
    const almacen = fakeAlmacen(["https://r/a.webp"]);
    const resultado = await sincronizar(manifiestoCon("https://r/a.webp", "https://r/b.webp"), almacen);
    expect(resultado).toMatchObject({ completo: true, descargadas: ["https://r/b.webp"], eliminadas: [], fallidas: [] });
  });

  test("borra del disco lo que ya no está en el manifiesto (pieza sustituida, retirada o vencida)", async () => {
    const almacen = fakeAlmacen(["https://r/vieja.webp"]);
    const resultado = await sincronizar(manifiestoCon("https://r/nueva.webp"), almacen);
    expect(resultado.eliminadas).toEqual(["https://r/vieja.webp"]);
    expect([...almacen.guardadas]).toEqual(["https://r/nueva.webp"]);
  });

  test("sin cambios no descarga ni borra nada", async () => {
    const almacen = fakeAlmacen(["https://r/a.webp"]);
    await sincronizar(manifiestoCon("https://r/a.webp"), almacen);
    expect(almacen.llamadas).toEqual([]);
  });

  test("si una descarga falla no borra NADA (lo viejo sigue en pantalla), continúa con las demás y marca incompleto", async () => {
    const almacen = fakeAlmacen(["https://r/vieja.webp"], ["https://r/nueva1.webp"]);
    const resultado = await sincronizar(manifiestoCon("https://r/nueva1.webp", "https://r/nueva2.webp"), almacen);
    expect(resultado.completo).toBe(false);
    expect(resultado.fallidas).toEqual(["https://r/nueva1.webp"]);
    expect(resultado.descargadas).toEqual(["https://r/nueva2.webp"]);
    expect(resultado.eliminadas).toEqual([]);
    expect(almacen.guardadas.has("https://r/vieja.webp")).toBe(true);
  });

  test("incluye los pósters y descarga cada URL una sola vez", async () => {
    const manifiesto = armarManifiesto({
      items: [
        itemDePrueba({ id: "a", orden: 1, mediaUrl: "https://r/a.mp4", mediaTipo: "VIDEO", posterUrl: "https://r/a.jpg" }),
        itemDePrueba({ id: "b", orden: 2, mediaUrl: "https://r/a.jpg" }),
      ],
      ajustes: { duracionSeg: 12, transicion: "FUNDIDO", version: 1 },
      tasaBcv: null,
      ahora: new Date("2026-10-15T16:00:00Z"),
    });
    const almacen = fakeAlmacen();
    await sincronizar(manifiesto, almacen);
    expect(almacen.llamadas.sort()).toEqual(["guardar:https://r/a.jpg", "guardar:https://r/a.mp4"]);
  });

  test("un manifiesto vacío borra todo lo guardado", async () => {
    const almacen = fakeAlmacen(["https://r/a.webp"]);
    const resultado = await sincronizar(manifiestoCon(), almacen);
    expect(resultado.completo).toBe(true);
    expect(almacen.guardadas.size).toBe(0);
  });
});
```

`apps/vitrina/lib/sse.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { leerEventos } from "./sse";

const flujoDe = (trozos: string[]) => {
  const codificador = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controlador) {
      for (const trozo of trozos) controlador.enqueue(codificador.encode(trozo));
      controlador.close();
    },
  });
};

describe("leerEventos", () => {
  test("entrega el nombre de cada evento", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["event: vitrina:cambio\ndata: 1\n\n", "event: vitrina:cambio\ndata: 2\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio", "vitrina:cambio"]);
  });

  test("ignora los comentarios (: conectado, : latido)", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe([": conectado\n\n", ": latido\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual([]);
  });

  test("junta un evento partido en varios trozos de red", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["event: vitrina:cam", "bio\nda", "ta: 1\n", "\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio"]);
  });

  test("un evento sin nombre llega como 'message'", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["data: hola\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["message"]);
  });
});
```

Run: `npm test --workspace apps/vitrina`. Expected: FAIL (módulos no existen).

- [ ] **Step 2: Interfaz del almacén, sincronización y SSE**

`apps/vitrina/lib/almacen.ts`:

```ts
import { Capacitor } from "@capacitor/core";
import { AlmacenDisco } from "./almacenDisco";
import { AlmacenWeb } from "./almacenWeb";

// Dónde viven las piezas (fotos y videos) una vez descargadas. En el APK son archivos en el almacenamiento interno
// de la app; en el navegador (desarrollo) es la Cache API.
export interface Almacen {
  iniciar(): Promise<void>;
  /** URL reproducible de una pieza ya guardada, o null si no está. */
  rutaLocal(url: string): string | null;
  /** Descarga la pieza si falta; lanza si no se pudo (sin red, sin espacio…). */
  guardar(url: string): Promise<void>;
  eliminar(url: string): Promise<void>;
  /** URLs remotas de las piezas guardadas. */
  listar(): Promise<string[]>;
}

export function crearAlmacen(): Almacen {
  return Capacitor.isNativePlatform() ? new AlmacenDisco() : new AlmacenWeb();
}
```

`apps/vitrina/lib/sincronizar.ts`:

```ts
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { urlsDeManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import type { Almacen } from "./almacen";

export interface ResultadoSincronizacion {
  completo: boolean;
  descargadas: string[];
  eliminadas: string[];
  fallidas: string[];
}

// Deja el almacén con exactamente lo que pide el manifiesto: descarga lo que falta y borra lo que sobra. Si alguna
// descarga falla NO borra nada (lo anterior sigue disponible para lo que aún se muestra) y devuelve completo=false:
// quien llama conserva el manifiesto viejo y reintenta.
export async function sincronizar(manifiesto: ManifiestoVitrina, almacen: Almacen): Promise<ResultadoSincronizacion> {
  const necesarias = urlsDeManifiesto(manifiesto);
  const guardadas = new Set(await almacen.listar());

  const descargadas: string[] = [];
  const fallidas: string[] = [];
  for (const url of necesarias) {
    if (guardadas.has(url)) continue;
    try {
      await almacen.guardar(url);
      descargadas.push(url);
    } catch (error) {
      console.warn("[vitrina] no se pudo descargar", url, error);
      fallidas.push(url);
    }
  }

  const eliminadas: string[] = [];
  if (fallidas.length === 0) {
    const vigentes = new Set(necesarias);
    for (const url of guardadas) {
      if (vigentes.has(url)) continue;
      try {
        await almacen.eliminar(url);
        eliminadas.push(url);
      } catch (error) {
        console.warn("[vitrina] no se pudo borrar", url, error);
      }
    }
  }
  return { completo: fallidas.length === 0, descargadas, eliminadas, fallidas };
}
```

`apps/vitrina/lib/sse.ts`:

```ts
// Lee un flujo text/event-stream y avisa del nombre de cada evento. Los comentarios (": latido") solo mantienen
// viva la conexión y se ignoran. Resuelve cuando el servidor cierra el flujo.
export async function leerEventos(cuerpo: ReadableStream<Uint8Array>, alEvento: (nombre: string) => void): Promise<void> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let pendiente = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return;
    pendiente += decodificador.decode(value, { stream: true });
    let corte: number;
    while ((corte = pendiente.indexOf("\n\n")) !== -1) {
      const bloque = pendiente.slice(0, corte);
      pendiente = pendiente.slice(corte + 2);
      const lineas = bloque.split("\n").filter((linea) => !linea.startsWith(":") && linea !== "");
      if (lineas.length === 0) continue;
      const nombre = lineas.find((linea) => linea.startsWith("event:"))?.slice(6).trim() ?? "message";
      alEvento(nombre);
    }
  }
}
```

Run: `npm test --workspace apps/vitrina`. Expected: PASS.

- [ ] **Step 3: Almacén en disco (APK)**

Antes de escribirlo, confirmar la firma real del plugin instalado:

```bash
cat apps/vitrina/node_modules/@capacitor/file-transfer/dist/esm/definitions.d.ts 2>/dev/null || cat node_modules/@capacitor/file-transfer/dist/esm/definitions.d.ts
```

Esperado: `FileTransfer.downloadFile({ url, path, ... })` con `path` como URI de archivo (`file://…`) obtenida con `Filesystem.getUri`. Si el nombre o la forma de las opciones difiere, **ajustar solo la llamada `FileTransfer.downloadFile` del código de abajo** a esa definición (el resto no cambia).

`apps/vitrina/lib/almacenDisco.ts`:

```ts
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileTransfer } from "@capacitor/file-transfer";
import type { Almacen } from "./almacen";

const CARPETA = "vitrina";
const CLAVE_INDICE = "vitrina_indice";

interface Entrada {
  archivo: string;
  bytes: number;
}

// Nombre de archivo local: el último tramo de la URL (un UUID único por subida) sin caracteres raros.
const nombreDe = (url: string) => (url.split("?")[0].split("/").pop() ?? "pieza").replace(/[^A-Za-z0-9._-]/g, "_");

export class AlmacenDisco implements Almacen {
  private indice: Record<string, Entrada> = {};
  private readonly rutas = new Map<string, string>();

  async iniciar(): Promise<void> {
    await Filesystem.mkdir({ path: CARPETA, directory: Directory.Data, recursive: true }).catch(() => {});
    try {
      this.indice = JSON.parse(localStorage.getItem(CLAVE_INDICE) ?? "{}") as Record<string, Entrada>;
    } catch {
      this.indice = {};
    }

    const { files } = await Filesystem.readdir({ path: CARPETA, directory: Directory.Data });
    const enDisco = new Set(files.map((f) => f.name));
    const usados = new Set(Object.values(this.indice).map((e) => e.archivo));

    // Huérfanos (descarga interrumpida, índice perdido): se borran.
    for (const nombre of enDisco) {
      if (!usados.has(nombre)) await this.borrarArchivo(nombre);
    }
    // Entradas sin archivo: se olvidan.
    for (const [url, entrada] of Object.entries(this.indice)) {
      if (!enDisco.has(entrada.archivo)) delete this.indice[url];
    }
    for (const [url, entrada] of Object.entries(this.indice)) this.rutas.set(url, await this.rutaDe(entrada.archivo));
    this.guardarIndice();
  }

  rutaLocal(url: string): string | null {
    return this.rutas.get(url) ?? null;
  }

  async guardar(url: string): Promise<void> {
    if (this.indice[url]) return;
    const archivo = nombreDe(url);
    const temporal = `${archivo}.part`;
    await this.borrarArchivo(temporal);

    // Se descarga a un nombre temporal y se renombra al terminar: nunca se reproduce un archivo a medias.
    const destino = await Filesystem.getUri({ path: `${CARPETA}/${temporal}`, directory: Directory.Data });
    await FileTransfer.downloadFile({ url, path: destino.uri });
    await Filesystem.rename({
      from: `${CARPETA}/${temporal}`,
      to: `${CARPETA}/${archivo}`,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    });
    const { size } = await Filesystem.stat({ path: `${CARPETA}/${archivo}`, directory: Directory.Data });

    this.indice[url] = { archivo, bytes: size };
    this.rutas.set(url, await this.rutaDe(archivo));
    this.guardarIndice();
  }

  async eliminar(url: string): Promise<void> {
    const entrada = this.indice[url];
    if (!entrada) return;
    await this.borrarArchivo(entrada.archivo);
    delete this.indice[url];
    this.rutas.delete(url);
    this.guardarIndice();
  }

  async listar(): Promise<string[]> {
    return Object.keys(this.indice);
  }

  private async rutaDe(archivo: string): Promise<string> {
    const { uri } = await Filesystem.getUri({ path: `${CARPETA}/${archivo}`, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  }

  private async borrarArchivo(archivo: string): Promise<void> {
    await Filesystem.deleteFile({ path: `${CARPETA}/${archivo}`, directory: Directory.Data }).catch(() => {});
  }

  private guardarIndice(): void {
    try {
      localStorage.setItem(CLAVE_INDICE, JSON.stringify(this.indice));
    } catch {
      // sin localStorage el índice se reconstruye vacío y los archivos huérfanos se limpian al arrancar
    }
  }
}
```

- [ ] **Step 4: Almacén de respaldo (navegador, desarrollo)**

`apps/vitrina/lib/almacenWeb.ts`:

```ts
import type { Almacen } from "./almacen";

const NOMBRE_CACHE = "vitrina-medios";

// Respaldo con la Cache API para correr la vitrina en un navegador (desarrollo). El APK usa AlmacenDisco.
export class AlmacenWeb implements Almacen {
  private readonly urls = new Map<string, string>();

  async iniciar(): Promise<void> {
    const cache = await caches.open(NOMBRE_CACHE);
    for (const peticion of await cache.keys()) {
      const respuesta = await cache.match(peticion);
      if (respuesta) this.urls.set(peticion.url, URL.createObjectURL(await respuesta.blob()));
    }
  }

  rutaLocal(url: string): string | null {
    return this.urls.get(url) ?? null;
  }

  async guardar(url: string): Promise<void> {
    if (this.urls.has(url)) return;
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const cache = await caches.open(NOMBRE_CACHE);
    await cache.put(url, respuesta.clone());
    this.urls.set(url, URL.createObjectURL(await respuesta.blob()));
  }

  async eliminar(url: string): Promise<void> {
    await (await caches.open(NOMBRE_CACHE)).delete(url);
    const local = this.urls.get(url);
    if (local) URL.revokeObjectURL(local);
    this.urls.delete(url);
  }

  async listar(): Promise<string[]> {
    return [...this.urls.keys()];
  }
}
```

- [ ] **Step 5: API, espera y hook**

`apps/vitrina/lib/esperar.ts`:

```ts
// Espera `ms` o hasta que se cancele (lo que ocurra primero); nunca lanza.
export function esperar(ms: number, señal: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    if (señal.aborted) return resolver();
    const temporizador = setTimeout(resolver, ms);
    señal.addEventListener(
      "abort",
      () => {
        clearTimeout(temporizador);
        resolver();
      },
      { once: true }
    );
  });
}
```

`apps/vitrina/lib/api.ts`:

```ts
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import type { ConfigVitrina } from "./config";
import { leerEventos } from "./sse";

const cabeceras = (config: ConfigVitrina) => ({ "X-Kiosk-Api-Key": config.clave });

export async function pedirManifiesto(config: ConfigVitrina, señal?: AbortSignal): Promise<ManifiestoVitrina> {
  const respuesta = await fetch(`${config.apiUrl}/api/kiosco/vitrina`, { headers: cabeceras(config), signal: señal, cache: "no-store" });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return (await respuesta.json()) as ManifiestoVitrina;
}

// Mantiene abierta la conexión de avisos (SSE) hasta que el servidor la cierre o se cancele. `fetch` con stream y
// cabecera (EventSource no admite cabeceras). Lanza si la conexión no se pudo abrir o se cortó.
export async function abrirEventos(
  config: ConfigVitrina,
  oyentes: { alAbrir: () => void; alEvento: () => void },
  señal: AbortSignal
): Promise<void> {
  const respuesta = await fetch(`${config.apiUrl}/api/kiosco/vitrina/eventos`, {
    headers: { ...cabeceras(config), Accept: "text/event-stream" },
    signal: señal,
    cache: "no-store",
  });
  if (!respuesta.ok || !respuesta.body) throw new Error(`HTTP ${respuesta.status}`);
  oyentes.alAbrir();
  await leerEventos(respuesta.body, (nombre) => {
    if (nombre === "vitrina:cambio") oyentes.alEvento();
  });
}
```

`apps/vitrina/lib/useVitrina.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { instanteEfectivo } from "@gym-app/domain/utils/relojEfectivo";
import { crearAlmacen, type Almacen } from "./almacen";
import { abrirEventos, pedirManifiesto } from "./api";
import { cargarConfig, type ConfigVitrina } from "./config";
import { esperar } from "./esperar";
import { sincronizar } from "./sincronizar";

const CLAVE_MANIFIESTO = "vitrina_manifiesto";
const CLAVE_SERVIDOR_AHORA = "vitrina_servidor_ahora";
const SONDEO_MS = 10 * 60_000; // red de seguridad: siempre aplica el manifiesto completo
const REINTENTO_INCOMPLETO_MS = 60_000;
const ESPERA_MIN_MS = 2_000;
const ESPERA_MAX_MS = 60_000;
const RELOJ_MS = 15_000;

function leer<T>(clave: string): T | null {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento persistente la vitrina funciona igual, solo que sin respaldo del último manifiesto
  }
}

export interface EstadoVitrina {
  manifiesto: ManifiestoVitrina | null;
  almacen: Almacen | null;
  ahora: Date; // instante efectivo: nunca anterior al último servidorAhora conocido
}

export function useVitrina(): EstadoVitrina {
  const [manifiesto, setManifiesto] = useState<ManifiestoVitrina | null>(null);
  const [almacen, setAlmacen] = useState<Almacen | null>(null);
  const servidorAhora = useRef<Date | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    let cancelado = false;
    const controlador = new AbortController();
    let enCurso: Promise<void> | null = null;
    let reintento: ReturnType<typeof setTimeout> | undefined;

    const recordarServidorAhora = (iso: string) => {
      guardar(CLAVE_SERVIDOR_AHORA, iso);
      servidorAhora.current = new Date(iso);
    };

    // Un solo ciclo a la vez. Solo se adopta el manifiesto nuevo si TODAS sus piezas están en disco: mientras una
    // baja (o falla), la TV sigue mostrando el anterior con sus archivos intactos.
    const sincronizarTodo = (config: ConfigVitrina, alm: Almacen): Promise<void> => {
      enCurso ??= (async () => {
        try {
          const nuevo = await pedirManifiesto(config, controlador.signal);
          if (cancelado) return;
          recordarServidorAhora(nuevo.servidorAhora);
          const resultado = await sincronizar(nuevo, alm);
          if (cancelado) return;
          if (resultado.completo) {
            guardar(CLAVE_MANIFIESTO, nuevo);
            setManifiesto(nuevo);
          } else {
            clearTimeout(reintento);
            reintento = setTimeout(() => void sincronizarTodo(config, alm), REINTENTO_INCOMPLETO_MS);
          }
        } catch (error) {
          console.warn("[vitrina] no se pudo sincronizar:", error);
        } finally {
          enCurso = null;
        }
      })();
      return enCurso;
    };

    const escuchar = async (config: ConfigVitrina, alm: Almacen) => {
      let espera = ESPERA_MIN_MS;
      while (!cancelado) {
        try {
          await abrirEventos(
            config,
            {
              alAbrir: () => {
                espera = ESPERA_MIN_MS;
                void sincronizarTodo(config, alm); // al (re)conectar se pone al día
              },
              alEvento: () => void sincronizarTodo(config, alm),
            },
            controlador.signal
          );
        } catch {
          // sin red o conexión cortada: se reintenta con espera creciente
        }
        if (cancelado) return;
        await esperar(espera, controlador.signal);
        espera = Math.min(espera * 2, ESPERA_MAX_MS);
      }
    };

    const iniciarAlmacenYReloj = async () => {
      const guardado = leer<string>(CLAVE_SERVIDOR_AHORA);
      if (guardado) servidorAhora.current = new Date(guardado);
      setAhora(instanteEfectivo(new Date(), servidorAhora.current));

      const alm = crearAlmacen();
      await alm.iniciar();
      if (cancelado) return null;
      setAlmacen(alm);
      const anterior = leer<ManifiestoVitrina>(CLAVE_MANIFIESTO);
      if (anterior) setManifiesto(anterior); // sin red: se arranca con lo último que se mostró
      return alm;
    };

    const relojId = setInterval(() => setAhora(instanteEfectivo(new Date(), servidorAhora.current)), RELOJ_MS);
    let sondeoId: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      try {
        const alm = await iniciarAlmacenYReloj();
        if (!alm || cancelado) return;
        const config = await cargarConfig();
        void sincronizarTodo(config, alm);
        sondeoId = setInterval(() => void sincronizarTodo(config, alm), SONDEO_MS);
        void escuchar(config, alm);
      } catch (error) {
        console.error("[vitrina] no se pudo iniciar:", error);
      }
    })();

    return () => {
      cancelado = true;
      controlador.abort();
      clearInterval(relojId);
      clearInterval(sondeoId);
      clearTimeout(reintento);
    };
  }, []);

  return { manifiesto, almacen, ahora };
}
```

- [ ] **Step 6: Verificar y sugerir el commit**

`npm test --workspace apps/vitrina` no se corre en local (no hay `node_modules` de ese workspace): lo ejecuta el workflow `verificar-vitrina.yml` junto con tipos y lint. Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el almacén en disco, la sincronización de medios y el aviso SSE de la app de TV
```

Expected: tests en verde, lint y tipos sin errores.

**Verificación manual del aviso de cambios y de la sincronización (se completa en la Task 13, Step 7):** el hook solo se puede observar con la app corriendo. En el punto de verificación V2, con la vista previa `https://<dominio-de-gym-app-vitrina-tv>/#clave=<API key de zip-gym>` y el panel de `https://<dominio-de-gym-app-vitrina>` (el mismo web-admin al que apunta la vista previa), abrir la consola del navegador de la vista previa y comprobar que: al arrancar pide el manifiesto; al activar, mover o eliminar algo en el panel local llega `vitrina:cambio` y se vuelve a pedir; y al cortar la red (DevTools → Offline) y restablecerla reconecta y se pone al día. Si el panel estuviera en producción y la vista previa apuntara al servicio de pruebas (o al revés), el aviso **no** llegaría: el emisor es en memoria por proceso. Usar siempre la sede y la API key de `zip-gym`.

---

### Task 13: App de TV, reproductor, franjas, carteles y badges

**Files:**
- Create: `apps/vitrina/components/{PantallaMarca,Medio,Badges,Cartel,Franja,Reproductor}.tsx`
- Modify: `apps/vitrina/app/page.tsx`

**Interfaces:**
- Consumes: `useVitrina` (Task 12), `construirSecuencia`, `Diapositiva` (Task 3), `itemsDeManifiesto` (Task 4), `descuentoMostrado`, `equivalenteBs`, `precioVigenteUSD` (Task 4), `estadoDeTasa`, `formatearBs`, `diaCalendarioCaracas` (Task 2).
- Produces: `<Reproductor manifiesto almacen ahora />`, `<PantallaMarca />`.

- [ ] **Step 1: Pantalla de marca (nunca negro)**

`apps/vitrina/components/PantallaMarca.tsx`:

```tsx
// Lo que se ve cuando no hay nada que mostrar (arranque, sin ítems activos): la marca, nunca una pantalla en negro.
export function PantallaMarca() {
  return (
    <main className="flex h-full w-full items-center justify-center" style={{ background: "var(--gx-ground)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- recurso local empaquetado */}
      <img src="/branding/escudo.png" alt="Adrenalina Xtreme Gym" className="h-[70vh] w-auto object-contain" />
    </main>
  );
}
```

- [ ] **Step 2: Medio (imagen o video, desde disco)**

`apps/vitrina/components/Medio.tsx`:

```tsx
import type { Almacen } from "@/lib/almacen";
import type { TipoMedio } from "@gym-app/domain/entities/Vitrina";

interface Props {
  url: string;
  tipo: TipoMedio;
  posterUrl: string | null;
  almacen: Almacen;
  /** Solo un video reproduce a la vez en una franja: los demás muestran su póster. */
  reproducir: boolean;
  ajuste: "cover" | "contain";
}

// Siempre prefiere el archivo guardado en el equipo; la URL remota solo es el último recurso (aún no descargado).
export function Medio({ url, tipo, posterUrl, almacen, reproducir, ajuste }: Props) {
  const clase = `h-full w-full ${ajuste === "cover" ? "object-cover" : "object-contain"}`;
  const fuente = almacen.rutaLocal(url) ?? url;
  const poster = posterUrl ? (almacen.rutaLocal(posterUrl) ?? posterUrl) : undefined;

  if (tipo === "VIDEO" && reproducir) {
    return <video key={fuente} src={fuente} poster={poster} autoPlay muted loop playsInline className={clase} />;
  }
  if (tipo === "VIDEO") {
    // eslint-disable-next-line @next/next/no-img-element -- póster guardado en el equipo
    return poster ? <img src={poster} alt="" className={clase} /> : <div className="h-full w-full bg-black" />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- imagen guardada en el equipo
  return <img src={fuente} alt="" className={clase} />;
}
```

- [ ] **Step 3: Badges de precio**

`apps/vitrina/components/Badges.tsx`:

```tsx
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { EstadoTasa } from "@gym-app/domain/utils/estadoTasa";
import { formatearBs } from "@gym-app/domain/utils/formatearBs";
import { descuentoMostrado, equivalenteBs } from "@gym-app/domain/utils/vitrinaBadges";

const usd = (monto: number) => `$${monto.toFixed(2)}`;

// Etiqueta, descuento, precio (tachado si hay oferta), oferta y equivalente en Bs, cada uno según sus banderas.
// El Bs se oculta solo si la tasa está DESACTUALIZADA o no hay tasa (equivalenteBs lo decide).
export function Badges({ item, tasa }: { item: VitrinaItem; tasa: { valor: number; estado: EstadoTasa } | null }) {
  const etiqueta = item.mostrarEtiqueta ? item.etiqueta : null;
  const descuento = descuentoMostrado(item);
  const oferta = item.mostrarOferta ? item.ofertaUSD : null;
  const precio = item.mostrarPrecio ? item.precioUSD : null;
  const bs = equivalenteBs(item, tasa);
  if (etiqueta === null && descuento === null && oferta === null && precio === null) return null;

  return (
    <div className="absolute bottom-[3rem] left-[3rem] flex flex-col items-start gap-[0.6rem]">
      <div className="flex gap-[0.6rem]">
        {etiqueta && (
          <span className="titulo rounded-[0.5rem] px-[1.2rem] py-[0.3rem] text-[2.4rem]" style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}>
            {etiqueta}
          </span>
        )}
        {descuento !== null && (
          <span className="titulo rounded-[0.5rem] px-[1.2rem] py-[0.3rem] text-[2.4rem]" style={{ background: "var(--gx-warn)", color: "var(--gx-warn-ink)" }}>
            -{descuento}%
          </span>
        )}
      </div>
      {(oferta !== null || precio !== null) && (
        <div className="flex items-baseline gap-[1.2rem] rounded-[0.8rem] px-[1.6rem] py-[0.6rem]" style={{ background: "rgba(10, 13, 7, 0.78)" }}>
          {oferta !== null ? (
            <>
              {precio !== null && (
                <span className="text-[2.2rem] line-through" style={{ color: "var(--gx-muted)" }}>
                  {usd(precio)}
                </span>
              )}
              <span className="titulo text-[5rem]" style={{ color: "var(--gx-accent)" }}>
                {usd(oferta)}
              </span>
            </>
          ) : (
            <span className="titulo text-[5rem]" style={{ color: "var(--gx-ink)" }}>
              {usd(precio as number)}
            </span>
          )}
        </div>
      )}
      {bs !== null && (
        <span className="rounded-[0.6rem] px-[1.2rem] py-[0.3rem] text-[2.2rem] font-semibold" style={{ background: "rgba(10, 13, 7, 0.78)", color: "var(--gx-ink)" }}>
          Bs. {formatearBs(bs)}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Cartel (promo o producto a pantalla completa)**

`apps/vitrina/components/Cartel.tsx`:

```tsx
import type { Almacen } from "@/lib/almacen";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { EstadoTasa } from "@gym-app/domain/utils/estadoTasa";
import { Badges } from "./Badges";
import { Medio } from "./Medio";

export function Cartel({ item, almacen, tasa }: { item: VitrinaItem; almacen: Almacen; tasa: { valor: number; estado: EstadoTasa } | null }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <Medio url={item.mediaUrl} tipo={item.mediaTipo} posterUrl={item.posterUrl} almacen={almacen} reproducir ajuste="contain" />
      <Badges item={item} tasa={tasa} />
    </div>
  );
}
```

- [ ] **Step 5: Franja de entrenadores (3 columnas fijas, un video a la vez)**

`apps/vitrina/components/Franja.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { Medio } from "./Medio";

// Cada columna mide siempre 1/3 de la pantalla: con 1 o 2 entrenadores se centran sin estirar las fotos. En cada
// franja reproduce un solo video a la vez (el decodificado simultáneo cansa a los TV box modestos); la columna
// activa rota cada duración/número de videos y las demás muestran su póster.
export function Franja({ entrenadores, duracionSeg, almacen }: { entrenadores: VitrinaItem[]; duracionSeg: number; almacen: Almacen }) {
  const conVideo = entrenadores.filter((e) => e.mostrarMedio && e.mediaTipo === "VIDEO").map((e) => e.id);
  const [turno, setTurno] = useState(0);

  useEffect(() => {
    if (conVideo.length < 2) return;
    const id = setInterval(() => setTurno((t) => (t + 1) % conVideo.length), (duracionSeg * 1000) / conVideo.length);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende solo de cuántos videos hay y de la duración
  }, [conVideo.length, duracionSeg]);

  const idActivo = conVideo[turno % Math.max(conVideo.length, 1)];

  return (
    <div className="flex h-full w-full justify-center" style={{ background: "var(--gx-ground)" }}>
      {entrenadores.map((entrenador) => (
        <section key={entrenador.id} className="relative h-full w-1/3 overflow-hidden border-x" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}>
          {entrenador.mostrarMedio && (
            <Medio
              url={entrenador.mediaUrl}
              tipo={entrenador.mediaTipo}
              posterUrl={entrenador.posterUrl}
              almacen={almacen}
              reproducir={entrenador.id === idActivo}
              ajuste="cover"
            />
          )}
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col gap-[0.4rem] px-[2.4rem] pt-[8rem] pb-[3rem]"
            style={{ background: "linear-gradient(to top, rgba(10,13,7,0.95), rgba(10,13,7,0))" }}
          >
            {entrenador.mostrarNombre && entrenador.nombre && (
              <span className="titulo text-[5.5rem] leading-none" style={{ color: "var(--gx-ink)" }}>
                {entrenador.nombre}
              </span>
            )}
            {entrenador.mostrarEspecialidad && entrenador.especialidad && (
              <span className="text-[2.6rem] font-semibold uppercase" style={{ color: "var(--gx-accent)" }}>
                {entrenador.especialidad}
              </span>
            )}
            {entrenador.mostrarFrase && entrenador.frase && (
              <span className="text-[2.2rem]" style={{ color: "var(--gx-muted)" }}>
                {entrenador.frase}
              </span>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Reproductor y página**

`apps/vitrina/components/Reproductor.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { construirSecuencia } from "@gym-app/domain/services/secuenciaVitrina";
import { itemsDeManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import { estadoDeTasa } from "@gym-app/domain/utils/estadoTasa";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { Cartel } from "./Cartel";
import { Franja } from "./Franja";
import { PantallaMarca } from "./PantallaMarca";

export function Reproductor({ manifiesto, almacen, ahora }: { manifiesto: ManifiestoVitrina; almacen: Almacen; ahora: Date }) {
  // La secuencia se recalcula cada minuto (y al cambiar el manifiesto): así un ítem programado entra, o uno que
  // vence sale, aunque la TV no tenga red.
  const minuto = Math.floor(ahora.getTime() / 60_000);
  const secuencia = useMemo(
    () => construirSecuencia(itemsDeManifiesto(manifiesto), new Date(minuto * 60_000), manifiesto.duracionSeg),
    [manifiesto, minuto]
  );

  // El Bs depende del estado de la tasa respecto del día de Caracas del instante efectivo (no de la hora de la TV).
  const tasa = manifiesto.tasaBcv
    ? { valor: manifiesto.tasaBcv.valor, estado: estadoDeTasa(new Date(manifiesto.tasaBcv.fecha), diaCalendarioCaracas(new Date(minuto * 60_000))) }
    : null;

  const [indice, setIndice] = useState(0);
  const actual = secuencia.length > 0 ? secuencia[indice % secuencia.length] : null;
  const claveActual = actual?.clave;
  const duracionActual = actual?.duracionSeg;

  useEffect(() => {
    if (duracionActual === undefined) return;
    const id = setTimeout(() => setIndice((i) => i + 1), duracionActual * 1000);
    return () => clearTimeout(id);
  }, [claveActual, duracionActual, indice]);

  if (!actual) return <PantallaMarca />;

  return (
    <main key={`${actual.clave}:${indice}`} className={`h-full w-full ${manifiesto.transicion === "DESLIZAR" ? "trans-deslizar" : "trans-fundido"}`}>
      {actual.tipo === "FRANJA" ? (
        <Franja entrenadores={actual.entrenadores} duracionSeg={actual.duracionSeg} almacen={almacen} />
      ) : (
        <Cartel item={actual.item} almacen={almacen} tasa={tasa} />
      )}
    </main>
  );
}
```

Reemplazar `apps/vitrina/app/page.tsx`:

```tsx
"use client";

import { PantallaMarca } from "@/components/PantallaMarca";
import { Reproductor } from "@/components/Reproductor";
import { useVitrina } from "@/lib/useVitrina";

export default function PaginaVitrina() {
  const { manifiesto, almacen, ahora } = useVitrina();
  if (!manifiesto || !almacen) return <PantallaMarca />;
  return <Reproductor manifiesto={manifiesto} almacen={almacen} ahora={ahora} />;
}
```

- [ ] **Step 7: Verificar en el navegador (modo desarrollo, almacén web)**

```bash
cd /c/dev/gym-app/apps/vitrina
cp public/vitrina-config.ejemplo.json public/vitrina-config.json
```

Punto de verificación V2 (sin servidor local). Con el código subido a `vitrina` y los servicios `gym-app-vitrina` y `gym-app-vitrina-tv` desplegados, abrir la vista previa `https://<dominio-de-gym-app-vitrina-tv>/#clave=<API key de zip-gym>` (nunca la de `gym-demo`) a 1920x1080 (DevTools → modo dispositivo, o pantalla completa en un monitor Full HD). **El panel y la vista previa deben apuntar al mismo web-admin**: el panel en `https://<dominio-de-gym-app-vitrina>` con la sesión de la organización `zip-gym`. Si el panel fuera el de producción, el aviso de cambios (SSE) no llegaría a la vista previa, porque el emisor es en memoria por proceso:

1. Sin ítems activos: la pantalla de marca (no negro).
2. Activar en el panel una promo con oferta y Bs: aparece en segundos (sin recargar), con el precio tachado, la oferta y "Bs. …".
3. Activar 5 entrenadores seguidos: dos franjas (3+2), la de 2 centrada. Poner una promo entre ellos: se separan.
4. Con un video en una franja: solo uno reproduce y rota entre columnas; los demás muestran póster.
5. Cortar la red (DevTools → Offline) y recargar: sigue mostrando lo último.
6. Sustituir una pieza en el panel: la TV muestra primero la anterior y cambia solo cuando la nueva terminó de bajar.

- [ ] **Step 8: Verificación en la nube y sugerir el commit**

Tests, tipos y lint los comprueba el workflow `verificar-vitrina.yml`; el build estático, el de Docker de `gym-app-vitrina-tv`. Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
agrega el reproductor de la vitrina con franjas de 3 entrenadores, carteles y badges de precio
```

---

### Task 14: Integración, workflow real, documentación y verificación final

**Files:**
- Modify: `apps/vitrina-tv/README.md` (completar)
- Modify: `docs/superpowers/specs/2026-10-15-vitrina-tv-design.md` (desviaciones)
- Modify: `CLAUDE.md` (comandos y arquitectura de la vitrina)
- Modify: `handoff.md` (raíz; crear si no existe)
- Delete: `apps/vitrina-tv/prueba/` y el modo `prueba` del workflow solo si el equipo de la Task 1 ya no hace falta (opcional; después del Step 9)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: APK de la vitrina compilado por el workflow, instalado en el TV real y verificado.

- [ ] **Step 1: Corregir las desviaciones en la spec**

En `docs/superpowers/specs/2026-10-15-vitrina-tv-design.md`:
- En la sección 4, donde dice "compila `apps/vitrina` con `NEXT_PUBLIC_API_URL`", dejar: "compila `apps/vitrina` (la URL de la API no es de build: va en `vitrina-config.json` al preparar el APK)".
- En "Reloj y manifiesto", cambiar "Devuelve: ítems, …" a "Devuelve: ítems activos (excluye también los inactivos), …".

- [ ] **Step 2: README completo del APK**

Completar `apps/vitrina-tv/README.md` con: la tabla de secretos (`VITRINA_CLAVE_<SEDE>`, `KIOSCO_APK_PASSWORD`), el input `api_url`, el modo `prueba`, cómo desarrollar en el TV con `VITRINA_DEV_URL`, la lista de verificación de los Steps 7 a 9, y la advertencia "WebView ≥ 111; un cambio de diseño o de lógica de la app exige un APK nuevo, un cambio de contenido no".

- [ ] **Step 3: `CLAUDE.md`**

En la sección **Per-workspace** añadir `apps/vitrina` (Next export, `dev` en :3002, `test`, `build`) y `apps/vitrina-tv/capacitor` (cáscara Android, no es workspace npm, `npm test` y `npm run sync` allí). En **Architecture** añadir un párrafo: vitrina de TV (spec `docs/superpowers/specs/2026-10-15-vitrina-tv-design.md`, plan `docs/superpowers/plans/2026-10-15-vitrina-tv.md`, ADR-002), `GET /api/kiosco/vitrina` y `/eventos`, medios en R2 `vitrina/`, y la regla de la config local de Prisma (`prisma7.local.config.ts`).

- [ ] **Step 4: Ejecutar todo lo automático**

```bash
cd /c/dev/gym-app
npm test --workspace packages/domain
git diff --stat main -- apps/kiosk-tv .github/workflows/apk-kiosco.yml apps/kiosk
```

Expected: tests del dominio en verde y el último comando **sin salida** (el kiosco no cambió respecto de `main`). Lo demás (tests de `apps/vitrina` y de los scripts del APK, tipos y lint de web-admin y de la vitrina) lo comprueba el workflow `verificar-vitrina.yml`: Tipos y lint no se ejecutan en local: tras el push del usuario a `vitrina`, el workflow `Verificar la rama vitrina` (`.github/workflows/verificar-vitrina.yml`) debe terminar en verde (`gh run list --workflow verificar-vitrina.yml --limit 1`; si falla, `gh run view <id> --log-failed`).

Mensaje de commit sugerido para lo de los Steps 1 a 3 (el agente no hace commit ni push):

```text
completa la documentación de la vitrina y corrige la spec
```

- [ ] **Step 4b: Añadir al workflow la inspección automática del APK (sustituye a Android Studio → Analyze APK)**

En `.github/workflows/apk-vitrina.yml`, justo después del paso "Compilar el APK de debug" y antes de "Preparar el archivo a publicar", añadir (el `aapt2` viene en el Android SDK del runner; la clave nunca se imprime):

```yaml
      - name: Inspeccionar el APK (applicationId, versionCode, manifiesto, ícono y configuración)
        working-directory: apps/vitrina-tv/capacitor
        run: |
          APK=android/app/build/outputs/apk/debug/app-debug.apk
          AAPT2="$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 | sort -V | tail -1)"
          "$AAPT2" dump badging "$APK" > badging.txt
          grep -E "^package:|^launchable-activity|^application-label:|^uses-permission:|leanback|^banner|^application-icon-" badging.txt
          grep -q "name='com.adrenalina.vitrina'" badging.txt
          grep -q "versionCode='${{ github.run_number }}'" badging.txt
          grep -q "android.permission.RECEIVE_BOOT_COMPLETED" badging.txt
          grep -q "android.permission.SYSTEM_ALERT_WINDOW" badging.txt
          grep -q "android.software.leanback" badging.txt
          unzip -p "$APK" assets/capacitor.config.json | jq -e '(.server.url // null) == null and .loggingBehavior == "none" and .android.webContentsDebuggingEnabled == false and ((.plugins // {}).CapacitorHttp // null) == null' > /dev/null
          unzip -p "$APK" assets/public/vitrina-config.json | jq -e --arg u "${VITRINA_API_URL%/}" '.apiUrl == $u and (.clave | length) > 0' > /dev/null || { [ "$MODO" = "prueba" ] || exit 1; }
          unzip -l "$APK" | grep -E "assets/public/index.html" > /dev/null
          echo "Inspección del APK correcta"
```

Si el `aapt2` del runner imprime el `usesCleartextTraffic` o el nombre de la actividad de otra forma, ajustar los `grep` al formato real leyendo el log del primer run (no relajar las comprobaciones de `applicationId`, `versionCode`, `capacitor.config.json` ni `vitrina-config.json`). Mensaje de commit sugerido para este paso: `inspecciona automáticamente el APK de la vitrina en el workflow`.

- [ ] **Step 5: PUNTO DE CONTROL B: detenerse y esperar al usuario (Deploy 2)**

Avisar al usuario de que **las Tasks 7 a 14 (hasta el Step 4b) están completas en la rama `vitrina`** y pedirle: (1) confirmar que el último push a `vitrina` tiene en verde el workflow `Verificar la rama vitrina` y que V1 y V2 pasaron; (2) hacer el **Deploy 2**: unir `vitrina` con `main` y desplegar web-admin de producción (API del manifiesto, SSE, dashboard de la vitrina, R2); (3) confirmar que el merge, el push y el deploy están hechos y que el CORS de R2 incluye el dominio de producción. **No continuar sin esa confirmación**: el workflow del APK compila desde GitHub, no desde el working tree, y la TV pedirá el manifiesto al web-admin de producción.

Antes de pedirlo, recordarle un paso manual pendiente: el CORS (PUT) del bucket de R2 para el dominio de producción de web-admin (`docs/superpowers/plans/2026-10-15-vitrina-tv-cors-r2.md`).

- [ ] **Step 6: Compilar el APK real y descargarlo**

Con el Deploy 2 confirmado: crear el secreto de la sede de pruebas (sin pegar la clave en ningún chat ni log): `gh secret set VITRINA_CLAVE_ZIPGYM` (pide el valor por consola; la API key de la sede de **zip-gym**, nunca la de `gym-demo`) y confirmar que existe `KIOSCO_APK_PASSWORD`.

```bash
gh workflow run apk-vitrina.yml --ref main -f sucursal=zipgym -f api_url=<URL-de-web-admin-de-producción> -f modo=vitrina
gh run watch
```

Descargar el artefacto (`gh run download --name vitrina-zipgym --dir salida-vitrina`) y descifrar el `.7z` con la contraseña de `KIOSCO_APK_PASSWORD` para obtener `vitrina-zipgym.apk`. **No instalar todavía en el TV real:** primero los Steps 7 y 8.

- [ ] **Step 7: Revisar el resultado de la inspección del APK (sustituye a Android Studio → Analyze APK)**

Sin Android Studio en el PC: leer el log del paso "Inspeccionar el APK" (`gh run view <id> --log | grep -A40 "Inspeccionar el APK"`), que ya hizo fallar el workflow si algo no cuadra. Comprobar en ese log:

1. **`applicationId` y `versionCode`:** `com.adrenalina.vitrina` y un `versionCode` igual al `run_number` de la ejecución (no `1`).
2. **Manifiesto:** permisos `RECEIVE_BOOT_COMPLETED` y `SYSTEM_ALERT_WINDOW`, `LEANBACK_LAUNCHER` y la actividad lanzable; el `ArranqueReceiver` con `BOOT_COMPLETED`/`QUICKBOOT_POWERON` (no sale en `badging`: se confirma en el Step 9, punto 7) y orientación horizontal.
3. **Ícono:** el log lista los `application-icon-*` y el `banner`; el aspecto del escudo se confirma en el launcher de la TV (Step 9, punto 2).
4. **`assets/public/vitrina-config.json`:** `apiUrl` igual a la de producción pasada al workflow y `clave` no vacía (el workflow lo comprueba sin imprimirla).
5. **`assets/capacitor.config.json`:** sin `server.url`, `loggingBehavior: "none"`, `webContentsDebuggingEnabled: false` y sin `plugins.CapacitorHttp`.
6. **Contenido web:** `assets/public/index.html` está dentro del APK (la app no depende de internet para abrir).

Cualquier discrepancia: detenerse, corregir el workflow o los scripts y recompilar; no instalar en la TV.

- [ ] **Step 8: (suprimido) Emulador de Android TV**

Decisión del usuario: no hay emulador; el APK se prueba directamente en la TV real (Step 9). Los controles que iban aquí pasan al Step 9: ícono y nombre (punto 2), arranque sin red (punto 5), almacén en disco (punto 4) y arranque tras reiniciar (punto 7). A 1920x1080 deben verse las franjas de 3 columnas, los carteles y los badges completos y sin recortes (punto 3).

- [ ] **Step 9: Instalar en el TV real y marcar la checklist**

Con el panel y la vitrina ya apuntando **al mismo web-admin (el de producción, tras el Deploy 2)**, instalar con `adb install -r` en el TV real (primer arranque con la TV conectada por adb, para leer `adb logcat` si algo falla) y marcar cada punto:

1. **Cifrado:** el artefacto es un `.7z` cifrado; no hay `.apk` suelto en el `.zip`.
2. **Ícono y nombre:** el launcher del TV muestra "Vitrina AX" con el escudo; el banner de Android TV también.
3. **Contenido:** una promo, una franja de 3 entrenadores y un producto con oferta + Bs se ven bien a 1080p; el video de la franja reproduce de a uno.
4. **Cambios en vivo:** activar, ordenar o eliminar en el panel se refleja en segundos; sustituir una pieza descarga solo la nueva y borra el archivo viejo (`adb shell run-as com.adrenalina.vitrina ls files/vitrina`, o con el APK de debug).
5. **Sin red:** quitar el internet, apagar y encender el TV: **abre solo**, muestra el último contenido y respeta `inicio`/`fin`.
6. **Reloj tras un corte de luz:** desenchufar el TV, enchufarlo **sin internet**: un ítem ya vencido no reaparece y la tasa no cambia de estado por culpa de la hora.
7. **Arranque automático:** con los permisos por adb (README), apagar y encender: la app abre sola.
8. **Actualización encima:** compilar otra versión (otro `run_number`), `adb install -r`: se conservan los archivos descargados y los permisos (no hay que volver a descargar nada).
9. **Tasa desactualizada:** con la tasa de ayer (esperar al cambio de día o con una tasa antigua en la sede de pruebas), el equivalente en Bs desaparece y el USD se mantiene; un feriado largo con la tasa de ayer al día siguiente de sincronizar **no** lo oculta sin motivo.
10. **Depuración apagada:** desactivar la depuración USB/por red del TV y `adb disconnect`.

- [ ] **Step 10: `handoff.md`**

Actualizar (o crear) `handoff.md` en la raíz con exactamente las 5 secciones que pide `CLAUDE.md`: **Objetivo**, **Estado actual** (qué funciona y qué falta, incluyendo el resultado de la checklist), **Archivos y cambios** (por archivo), **Intentos fallidos** (conservar las entradas previas y añadir los aprendizajes de esta sesión, p. ej. que `@capacitor/file-transfer` no tiene serie 8) y **Próximos pasos**.

- [ ] **Step 11: Retirar el entorno de pruebas y sugerir el mensaje de commit final**

Una vez marcada la checklist del Step 9, pedir al usuario que **elimine** los servicios `gym-app-vitrina` y `gym-app-vitrina-tv` de EasyPanel, quite del CORS de R2 el dominio del servicio de pruebas y, si ya no se usa, borre la rama `vitrina` (y el workflow `verificar-vitrina.yml` solo si no quiere conservarlo para futuras ramas).

Dejar los cambios en el working tree: **no** ejecutar `git add`, `git commit` ni `git push` (el usuario hace commit, push y deploy). Mensaje de commit sugerido (una línea, en español):

```text
actualiza el handoff con el estado de la vitrina de TV
```

### Task 15: Video a duración completa y sonido por video

Cambio pedido por el usuario tras ver la vista previa: (1) un video se ve **completo, con su duración nativa**; (2) el **sonido** del video lo decide el panel, por video. Autorizado por el usuario, incluida **una migración aditiva** (excepción a la regla "la rama vitrina no agrega migraciones").

**Files:**
- Create: `packages/db/prisma/migrations/20261016000000_vitrina_sonido/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (`VitrinaItem.sonido Boolean @default(false)`)
- Modify: `packages/domain/entities/Vitrina.ts`, `packages/domain/entities/vitrinaItemDePrueba.ts`, `packages/domain/utils/vitrinaItem.ts` (+ sus `.test.ts`)
- Modify: `packages/infrastructure/persistence/prisma/PrismaVitrinaRepository.ts`
- Modify: `apps/web-admin/app/(panel)/vitrina/actions.ts`, `FormularioVitrinaItem.tsx`, `FilaVitrina.tsx`
- Modify: `apps/vitrina/components/{Medio,Cartel,Franja,Reproductor}.tsx`, `apps/vitrina/lib/rotarVideo.ts` (y/o helpers puros nuevos en `apps/vitrina/lib/` con tests)
- Modify: `apps/vitrina-tv/capacitor/android/app/src/main/java/com/adrenalina/vitrina/MainActivity.java`

**Requisitos (valores exactos):**
1. **Migración aditiva**, exactamente: `ALTER TABLE "VitrinaItem" ADD COLUMN "sonido" BOOLEAN NOT NULL DEFAULT false;` (con el comentario `-- AlterTable` como las demás). Se comprueba SIN conectar a ninguna base: `prisma migrate diff --from-schema <schema del commit anterior> --to-schema prisma/schema.prisma --script` debe dar el mismo SQL (obtener el schema anterior con `git show HEAD:packages/db/prisma/schema.prisma > <archivo temporal fuera del repo>`; usar `--config prisma7.local.config.ts` solo si hace falta y NUNCA la config por defecto). Prohibido `migrate deploy|dev|reset`, `db push`, `db seed` y cualquier `npm run db:*`.
2. **Dominio:** `VitrinaItem.sonido: boolean` y se acepta en `DatosVitrinaItem`/`CambiosVitrinaItem`. `validarVitrinaItem`: `sonido` solo tiene efecto con `mediaTipo === "VIDEO"`; con IMAGEN se normaliza a `false` (no es error). Pruebas: video con sonido, imagen con sonido pedido → false, valor ausente → false.
3. **Repositorio y acciones:** mapear/crear/actualizar `sonido`; `leerDatos` lee el interruptor `sonido` (checkbox). El manifiesto ya lo incluye si `armarManifiesto` esparce el ítem (verificarlo y, si no, añadirlo).
4. **Formulario del panel:** interruptor "Con sonido" dentro del `fieldset` "Qué se muestra en la TV", visible/habilitado solo cuando el medio es un VIDEO, con ayuda persistente ("Si está activo, el video se oye en la TV"; por defecto apagado). `FilaVitrina` muestra en texto "Con sonido" para videos con sonido (no solo color/ícono).
5. **Duración nativa (TV):**
   - **Cartel (promo/producto) con video:** la diapositiva dura lo que dure el video (avanza en el evento `ended`), sin `loop`. Si hay una sola diapositiva en toda la secuencia, el video se reinicia al terminar (bucle) en lugar de avanzar.
   - **Franja de entrenadores con videos:** los videos de la franja se reproducen **uno tras otro, completos, en orden de columna** (una cola dirigida por `ended`, reemplaza la rotación por tiempo de `rotarVideo`); las demás columnas muestran su póster/foto mientras tanto. La diapositiva termina cuando acabó el último video **y** pasó al menos `duracionSeg`. Una franja sin videos usa `duracionSeg` como hasta ahora. Con una sola diapositiva, la cola se reinicia desde el primer video.
   - **Salvaguardas obligatorias** (la TV nunca se queda pegada): si un video falla (`error`) se salta y cuenta como terminado; si la reproducción no avanza (`currentTime` sin cambios) durante 20 s se salta; tope absoluto por video de 10 min; si no hay forma de reproducir un video, se muestra su póster durante `duracionSeg` y se avanza.
   - La lógica de tiempos/cola va en helpers **puros** de `apps/vitrina/lib/` con pruebas de vitest (`npx vitest run apps/vitrina/lib/`): cola de la franja, cuándo termina la diapositiva (fin del último video y mínimo `duracionSeg`), salto por error/estancamiento/tope.
6. **Sonido (TV):** el `<video>` usa `muted={!item.sonido}`; solo suena el video en turno (en una franja nunca suenan dos). Si `play()` es rechazado por el navegador/WebView (autoplay con sonido bloqueado) se reintenta con `muted = true` (la vista previa en navegador lo necesitará: Chrome bloquea el sonido sin interacción) sin romper la secuencia. En `MainActivity.java`, tras `super.onCreate`, `getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);` para que el WebView de la TV permita autoplay con sonido.
7. Sin cambios en `apps/kiosk`, `apps/kiosk-tv` ni `.github/workflows/apk-kiosco.yml`. Textos en español, tokens `--gx-*`, sin hex.

**Review Focus de esta tarea:** video corto (< `duracionSeg`) y video largo (minutos) en cartel y en franja; franja con mezcla de fotos y videos; franja con 2 videos y 1 foto; un video que falla a la mitad; un video con sonido en una vista previa que bloquea el autoplay con sonido; secuencia de una sola diapositiva con video; un cambio de secuencia (SSE) mientras suena un video; ítems existentes (sin la columna) nacen con `sonido = false`.

- [ ] **Step 1:** Migración, schema, dominio y pruebas (`npm test --workspace packages/domain`).
- [ ] **Step 2:** Repositorio, acciones, formulario y fila del panel.
- [ ] **Step 3:** Helpers puros de tiempos y cola con pruebas (`npx vitest run apps/vitrina/lib/`).
- [ ] **Step 4:** Componentes de la TV (Medio, Cartel, Franja, Reproductor) y `MainActivity.java`.
- [ ] **Step 5:** Sugerir el mensaje de commit: `agrega la reproducción completa del video y el sonido por video en la vitrina`

### Task 16: Endurecimiento tras la revisión final

Hallazgos de la revisión final de toda la rama (ver el ledger): dos Importantes y tres Menores que se corrigen antes del merge.

**Files:**
- Modify: `apps/vitrina-tv/capacitor/scripts/configuracion.mjs` y `configuracion.test.mjs` (https obligatorio)
- Modify: `packages/domain/utils/vitrinaItem.ts` y `vitrinaItem.test.ts` (validación de números)
- Modify: `apps/web-admin/app/(panel)/vitrina/actions.ts` (rechazar cambio de tipo; capturar errores de guardado)
- Modify: `apps/vitrina/lib/sincronizar.ts`, `sincronizar.test.ts`, `useVitrina.ts`, `apps/vitrina/components/Reproductor.tsx` (+ helper puro nuevo `apps/vitrina/lib/reproducibles.ts` con test)
- Modify: `docs/superpowers/specs/2026-10-15-vitrina-tv-design.md` (sonido y duración completa del video)

**Requisitos (valores exactos):**
1. **`api_url` https:** `construirConfiguracion` lanza error si `VITRINA_API_URL` no empieza por `https://` (se permite `http://` solo cuando hay `VITRINA_DEV_URL`, es decir, en desarrollo). Mensaje en español. Pruebas: https válido, `http://` rechazado, vacío rechazado, con `VITRINA_DEV_URL` se permite http.
2. **Validación numérica en el dominio:** `descuentoPct` debe ser un entero entre 0 y 100 (mensaje claro; "12,5" ya llega como número no entero → error), `precioUSD` y `ofertaUSD` entre 0 y 99999999.99 con a lo sumo 2 decimales redondeables (columna `Decimal(10,2)`). El formulario debe mostrar el mensaje, nunca una página de error. Pruebas con 12.5, 150, -1, 1e9, 99999999.99, 10.456.
3. **`guardarItemAction`:** si `datos.tipo !== anterior.tipo` devolver `{ error: "No se puede cambiar el tipo de un ítem." }` sin escribir nada; y envolver `crear`/`actualizar` en try/catch que devuelva `{ error: "No se pudo guardar. Inténtalo de nuevo." }` (registrar el error en consola del servidor) en lugar de lanzar.
4. **La TV no se queda sin actualizar por una pieza que falla** (Important #1 de la revisión final): hoy el manifiesto nuevo solo se adopta si TODAS las piezas bajaron; con una pieza que da 404 o sin espacio, la TV queda congelada en el contenido viejo para siempre. Nuevo comportamiento: `sincronizar` devuelve además la lista `fallidas` (URLs). El hook cuenta intentos consecutivos fallidos por URL; cuando **todas** las URLs fallidas de una sincronización llevan **al menos 3 intentos consecutivos** (el reintento es cada 60 s), se adopta el manifiesto igualmente (mismo orden: adoptar y persistir, luego borrar obsoletos) y esas piezas quedan "omitidas": los ítems cuya `mediaUrl` no existe en el almacén local se EXCLUYEN de la secuencia (helper puro `itemsReproducibles(items, tieneLocal)` con tests; si todos quedan excluidos, pantalla de marca). Las piezas omitidas se siguen reintentando en cada sincronización (el contador no se reinicia mientras sigan fallando) y, cuando bajan, el ítem reaparece. Un éxito reinicia el contador de esa URL. Pruebas puras de `sincronizar` (fallidas devueltas, nada se borra si se decide no adoptar) y del helper de reproducibles.
5. **Spec:** actualizar `2026-10-15-vitrina-tv-design.md`: el sonido ya NO está fuera de alcance (interruptor por video en el panel, apagado por defecto), la franja reproduce los videos uno tras otro completos (no rotación por tiempo), los videos duran su duración nativa (cartel: hasta `ended`; franja: suma de sus videos con mínimo `duracionSeg`) y la pieza que falla repetidamente se omite tras 3 intentos. Sin tocar el resto.

**Restricciones:** sin migraciones, sin `git add/commit/push`; PC limitada (solo `npm test --workspace packages/domain`, `npx vitest run apps/vitrina/lib/` y `(cd apps/vitrina-tv/capacitor && npm test)`; nada de build/tsc/eslint/docker/prisma). Tipos y lint los verifica el workflow `verificar-vitrina.yml`; el lint de React no admite refs escritos durante el render ni `setState` síncrono en efectos: sigue el estilo de los componentes ya corregidos (refs actualizados en `useEffect`, valores derivados en el render).

- [ ] **Step 1:** https en la configuración del APK (1).
- [ ] **Step 2:** Validación numérica y acción de guardado (2, 3).
- [ ] **Step 3:** Pieza fallida omitida tras 3 intentos (4).
- [ ] **Step 4:** Spec (5).
- [ ] **Step 5:** Sugerir el mensaje de commit: `endurece la vitrina tras la revisión final: https del APK, validación numérica y pieza fallida omitida`

---

## Self-Review

**Cobertura de la spec** (cada sección → tarea):
- Modelo, ítems, entrenador independiente, `activo` false → Task 3, 6, 7, 10.
- Orden, franjas 3+2/3+2+2, intercalado, un video por franja → Task 3, 13.
- Tasa (`obtenerTasaVigenteFresca`, `estadoDeTasa`, Bs sobre precio vigente), `formatearBs` movido → Task 2, 4, 8, 13.
- Reloj efectivo y `servidorAhora`; manifiesto sin vencidos/inactivos y con futuros → Task 2, 4, 8, 12, 13.
- Medios en R2, `s3-request-presigner`, `Cache-Control`, `confirmarSubida` (en `guardarItemAction` con `inspeccionar`), borrado al reemplazar → Task 7, 9, 10.
- Video H.264/avc3, rotación, resolución, tope; imágenes 1920/8 MB → Task 5, 10.
- Migración sin tocar producción (config local, `migrate diff`, sin drift, aditiva) → Task 6.
- Dashboard: pestañas, vista Secuencia (subir/bajar), permisos, menú, notificación tras commit → Task 9, 10.
- App de TV empaquetada, config en bundle, almacén en disco con `file-transfer`, sustitución/borrado, SSE, sondeo siempre completo → Task 11, 12.
- Excepción al ADR-001 + regla de ESLint → Task 11.
- Cáscara `apps/vitrina-tv`, workflow, firma fija, `versionCode`, receiver de arranque, camino adb, desactivar adb, kiosco intacto → Task 1, 14.
- Prueba temprana en TV real → Task 1.
- Reutilización citada archivo por archivo: `.github/workflows/apk-kiosco.yml` (plantilla del workflow, Task 1), `apps/kiosk-tv/capacitor/android/**` (copia de la plantilla, Task 1 Step 1), `apps/kiosk-tv/capacitor/android/app/build.gradle` y `debug.keystore` (firma, Task 1), `apps/web-admin/lib/kiosco.ts` (CORS y `sucursalDeKiosco`, Task 8), `apps/web-admin/app/api/kiosco/estado/route.ts` (patrón y tasa, Task 8), `apps/web-admin/lib/tasaBcv.ts` (`orquestadorTasa`, Task 8), `apps/web-admin/app/(panel)/kiosko/{layout.tsx,tabs.ts,actions.ts}` (estructura y patrón de acciones, Task 9), `apps/web-admin/lib/permisoKiosko.ts` (permiso, Task 9), `apps/web-admin/app/(panel)/miembros/comprimirImagen.ts` (`canvasABlob`, Task 9/10), `apps/web-admin/app/(panel)/configuraciones/TabsConfiguraciones.tsx` (pestañas, Task 9), `packages/domain/utils/imagenSubida.ts` (extendido, Task 5), `packages/domain/utils/fechaCaracas.ts` (`diaCalendarioCaracas`, `inicioDelDiaCaracas`, Task 2/11/13), `packages/domain/use-cases/ObtenerTasaVigente.ts` (criterio extraído, Task 2), `packages/theming/tokens.ts` y `ThemeStyleTag.tsx` (tema, Task 11), `apps/kiosk/app/globals.css` y `app/layout.tsx` (escala en `rem` y estructura del layout, Task 11), `apps/kiosk/tsconfig.json`, `postcss.config.mjs` y `eslint.config.mjs` (copiados, Task 11), `PrismaEntrenadorRepository.listarPorOrganizacionYSucursal` (solo para copiar el nombre, Task 10). No se reutiliza: `sw.js`, la cola de check-ins, `claveFragmento.ts`, `GuardaWebView`/`versionWebView.ts` (la WebView ≥ 111 queda como requisito documentado), el Dockerfile del kiosco.

**Placeholders:** ninguno ("TBD"/"TODO"/"implementar luego" no aparecen). Los dos pasos de verificación contra la definición real del plugin y las opciones de `migrate diff` (Task 12 Step 3, Task 6 Step 4) son comprobaciones con la forma esperada ya escrita, no huecos.

**Consistencia de tipos:** `VitrinaItem`, `DatosVitrinaItem`, `CambiosVitrinaItem`, `AjustesVitrina`, `ManifiestoVitrina` se definen en Task 3 y se usan con esos nombres en 4, 7, 8, 9, 10, 12 y 13; `Diapositiva` (`tipo: "CARTEL" | "FRANJA"`, `entrenadores`, `item`, `duracionSeg`, `clave`) coincide entre Task 3 y Task 13; `Almacen` (`iniciar/rutaLocal/guardar/eliminar/listar`) coincide entre Task 12 (interfaz, implementaciones, `sincronizar`, `useVitrina`) y Task 13 (`Medio`); `equivalenteBs(item, tasa | null)` con `{ valor, estado }` coincide entre Task 4 y Task 13; `SubidaPrefirmada` coincide entre Task 7 y Task 9/10; `IVitrinaRepository` coincide entre Task 7, 8, 9 y 10.

**Riesgos conocidos (no bloquean el plan):** (1) abandonar un formulario después de subir un archivo deja un objeto huérfano en R2 (se acepta en v1); (2) las cabeceras firmadas de la URL prefirmada (`Content-Type`, `Cache-Control`) deben coincidir exactamente: el Step 7 de la Task 10 lo prueba en R2 real; (3) el proxy de producción puede cortar el SSE: se comprueba en la Task 14; (4) el keystore de debug es público (aceptado: instalar exige acceso físico).
