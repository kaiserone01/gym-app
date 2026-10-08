# Rediseño del kiosco — Fase 3 (APK para Android TV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una APK de Android TV (cáscara Capacitor que abre el kiosco remoto), una por sucursal con la clave dentro, compilada en GitHub Actions y publicada **cifrada** (el repo es público), con pantalla de aviso si el WebView del TV es anterior a Chromium 111.

**Architecture:** El kiosco web gana dos piezas pequeñas y testeables: leer la clave de `#clave=` en `/config` y una guarda que avisa si el WebView es viejo. Un proyecto Capacitor en `apps/kiosk-tv/capacitor/` (fuera de los workspaces de npm, para no tocar los Dockerfiles) abre `https://kiosco.zipnegocios.com/config#clave=<CLAVE>`; el manifest se ajusta para Android TV. Un workflow de GitHub Actions compila el APK y, si lleva clave, lo cifra con 7-Zip antes de subirlo.

**Tech Stack:** Capacitor (core, cli, android), Gradle/Android SDK en CI, GitHub Actions, `node --test` para los scripts del proyecto Capacitor, Vitest en `apps/kiosk`.

**Spec:** `docs/superpowers/specs/2026-10-08-rediseno-kiosco-design.md` (§9 APK, §10 F3).

## Global Constraints

- **Esta máquina no puede compilar Android** (solo JDK 8, sin Android SDK ni `adb`, 2,7 GB libres): nunca intentar instalar JDK/SDK/Android Studio localmente. La compilación se verifica únicamente en GitHub Actions.
- **El repositorio es público.** Nunca escribir una clave real de sucursal, contraseña ni secreto en el repo, en logs, en commits ni en archivos de reporte. Un APK con clave dentro **nunca** se sube sin cifrar; sin clave (prueba) puede subirse el APK genérico.
- Secretos de GitHub: `KIOSCO_CLAVE_<SUCURSAL>` (clave de cada sede, sucursal en MAYÚSCULAS) y `KIOSCO_APK_PASSWORD` (contraseña del `.7z`). Los crea el usuario; este plan no los crea ni los lee.
- `appId` = `com.adrenalina.kiosco`; nombre de la app = `Kiosco AX`; tráfico en claro desactivado; orientación horizontal.
- Chromium mínimo para el kiosco web: **111** (Tailwind v4). Debajo de eso, pantalla de aviso con estilos **en línea** (sin clases de Tailwind, porque un WebView viejo descarta todo el CSS dentro de `@layer`).
- La clave viaja en el **fragmento** de la URL (`#clave=`), nunca como query (los fragmentos no llegan al servidor). El valor se codifica con `encodeURIComponent`.
- Firma: llave de debug fija versionada (`debug.keystore`, contraseña `android`) para poder actualizar encima de una instalación previa; aceptado para una app privada de instalación manual.
- No ejecutar ningún comando contra la base de datos. Esta fase no toca `schema.prisma` ni `apps/web-admin`.
- Commits: **un solo renglón en español, sin firma ni trailers**. Tras cada tarea: commit y `git push origin main` (preferencia del usuario). Si el push del workflow `.github/workflows/*` es rechazado por falta del permiso `workflow` del token, reportar BLOCKED al controlador (no intentar rodear el rechazo).
- `AGENTS.md` de `apps/kiosk` avisa de cambios incompatibles de Next.js: usar solo patrones ya presentes en esos archivos.

## Review Focus

1. **Clave en el repo público:** que ningún archivo versionado, log del workflow ni artefacto sin cifrar contenga una clave. El workflow debe fallar de forma ruidosa (no subir) si hay clave y falta `KIOSCO_APK_PASSWORD`, y debe comprobar que no queda ningún `.apk` en `salida/` cuando hay clave (Task 5).
2. **Clave con caracteres especiales** (`+`, `/`, `=`, `&`, `#`, espacios): debe sobrevivir el viaje por el fragmento y quedar guardada tal cual en el kiosco (Tasks 1 y 3).
3. **WebView sin "Chrome/NNN" en el user agent** (otros motores) o con versión exacta 111: no debe mostrarse el aviso por error (Task 2).
4. **Primer arranque sin red:** el TV debe mostrar la página local `offline.html` y reintentar solo, no una pantalla de error del WebView (Task 3/4; se confirma en el TV).
5. **Reinstalar encima:** el APK nuevo debe poder actualizar al anterior (misma firma y mismo `appId`) sin desinstalar (Task 4).

---

### Task 1: Kiosco web — leer la clave de `#clave=` en `/config`

**Files:**
- Create: `apps/kiosk/lib/claveFragmento.ts`
- Test: `apps/kiosk/lib/claveFragmento.test.ts`
- Modify: `apps/kiosk/app/config/page.tsx`

**Interfaces:**
- Produces: `claveDeFragmento(hash: string): string | null` — usada por la página de configuración (y consumida indirectamente por la APK, Task 3, cuya URL de inicio es `.../config#clave=<CLAVE codificada>`).

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk/lib/claveFragmento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { claveDeFragmento } from "./claveFragmento";

describe("claveDeFragmento", () => {
  it("lee la clave de #clave=...", () => {
    expect(claveDeFragmento("#clave=abc123")).toBe("abc123");
    expect(claveDeFragmento("clave=abc123")).toBe("abc123");
  });

  it("decodifica los caracteres especiales que codificó encodeURIComponent", () => {
    expect(claveDeFragmento(`#clave=${encodeURIComponent("a+b/c=d&e#f g")}`)).toBe("a+b/c=d&e#f g");
  });

  it("quita espacios sobrantes de los bordes", () => {
    expect(claveDeFragmento("#clave=%20abc%20")).toBe("abc");
  });

  it("devuelve null si no hay clave", () => {
    expect(claveDeFragmento("")).toBeNull();
    expect(claveDeFragmento("#")).toBeNull();
    expect(claveDeFragmento("#clave=")).toBeNull();
    expect(claveDeFragmento("#clave=%20")).toBeNull();
    expect(claveDeFragmento("#otra=1")).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace apps/kiosk -- claveFragmento`
Expected: FAIL — no se puede resolver `./claveFragmento`.

- [ ] **Step 3: Implementar**

`apps/kiosk/lib/claveFragmento.ts`:

```ts
// Clave de la sucursal que la APK de Android TV pasa en la URL de inicio: `/config#clave=<codificada>`.
// Va en el fragmento (no en la query) para que no llegue al servidor ni a sus logs.
export function claveDeFragmento(hash: string): string | null {
  const clave = new URLSearchParams(hash.replace(/^#/, "")).get("clave")?.trim();
  return clave ? clave : null;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test --workspace apps/kiosk`
Expected: PASS (los tests anteriores más los 4 nuevos).

- [ ] **Step 5: Conectarlo a `/config`**

En `apps/kiosk/app/config/page.tsx`:
- Añadir el import: `import { claveDeFragmento } from "@/lib/claveFragmento";`
- Reemplazar el cuerpo del `useEffect` que hoy lee `localStorage` por (conservar el comentario explicativo que ya está encima del efecto y la línea `// eslint-disable-next-line react-hooks/set-state-in-effect ...` justo encima del `setApiKey`):

```tsx
  useEffect(() => {
    // La APK de Android TV abre /config#clave=...: se guarda la clave, se borra del historial y se pasa al kiosco.
    const claveDelFragmento = claveDeFragmento(window.location.hash);
    if (claveDelFragmento) {
      guardarApiKey(claveDelFragmento);
      window.history.replaceState(null, "", window.location.pathname);
      router.replace("/");
      return;
    }

    const guardado = obtenerApiKey();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, ver ADR de output: "export")
    if (guardado) setApiKey(guardado);
  }, [router]);
```

- [ ] **Step 6: Verificar**

Run: `npm test --workspace apps/kiosk` → Expected: PASS.
Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.
Run: `npm run lint --workspace apps/kiosk` → Expected: 0 errores (el aviso de fuentes en `app/layout.tsx` ya existía).
Run: `NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build --workspace apps/kiosk` → Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/lib/claveFragmento.ts apps/kiosk/lib/claveFragmento.test.ts apps/kiosk/app/config/page.tsx
git commit -m "permite cargar la clave de la sucursal desde el fragmento de la URL de configuración"
git push origin main
```

---

### Task 2: Kiosco web — aviso si el WebView es anterior a Chromium 111

**Files:**
- Create: `apps/kiosk/lib/versionWebView.ts`
- Test: `apps/kiosk/lib/versionWebView.test.ts`
- Create: `apps/kiosk/components/GuardaWebView.tsx`
- Modify: `apps/kiosk/app/layout.tsx`

**Interfaces:**
- Produces: `CHROMIUM_MINIMO = 111`, `versionChromium(userAgent: string): number | null`, `webViewObsoleto(userAgent: string, minimo?: number): boolean`, y `<GuardaWebView>{children}</GuardaWebView>` (muestra el aviso en lugar de `children` cuando el WebView es obsoleto).

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk/lib/versionWebView.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHROMIUM_MINIMO, versionChromium, webViewObsoleto } from "./versionWebView";

const WEBVIEW_91 =
  "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36";
const CHROME_120 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const EDGE_WEBVIEW2_130 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

describe("versionChromium", () => {
  it("lee la versión mayor de Chrome/NNN", () => {
    expect(versionChromium(WEBVIEW_91)).toBe(91);
    expect(versionChromium(CHROME_120)).toBe(120);
    expect(versionChromium(EDGE_WEBVIEW2_130)).toBe(130);
  });

  it("devuelve null si el user agent no tiene Chrome/", () => {
    expect(versionChromium(FIREFOX)).toBeNull();
    expect(versionChromium("")).toBeNull();
  });
});

describe("webViewObsoleto", () => {
  it("es obsoleto por debajo del mínimo", () => {
    expect(CHROMIUM_MINIMO).toBe(111);
    expect(webViewObsoleto(WEBVIEW_91)).toBe(true);
    expect(webViewObsoleto("Chrome/110.0.0.0")).toBe(true);
  });

  it("no es obsoleto con el mínimo exacto o más", () => {
    expect(webViewObsoleto("Chrome/111.0.0.0")).toBe(false);
    expect(webViewObsoleto(CHROME_120)).toBe(false);
  });

  it("no avisa si no se puede saber la versión (otros motores)", () => {
    expect(webViewObsoleto(FIREFOX)).toBe(false);
    expect(webViewObsoleto("")).toBe(false);
  });

  it("acepta otro mínimo", () => {
    expect(webViewObsoleto(CHROME_120, 130)).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace apps/kiosk -- versionWebView`
Expected: FAIL — no se puede resolver `./versionWebView`.

- [ ] **Step 3: Implementar la lógica**

`apps/kiosk/lib/versionWebView.ts`:

```ts
// Tailwind v4 (el CSS del kiosco) necesita Chromium 111 o más nuevo; un WebView viejo descarta el CSS
// dentro de @layer y la pantalla se vería sin maquetar.
export const CHROMIUM_MINIMO = 111;

export function versionChromium(userAgent: string): number | null {
  const coincidencia = /Chrome\/(\d+)/.exec(userAgent);
  return coincidencia ? Number(coincidencia[1]) : null;
}

// Si no se puede leer la versión (otros motores) no se avisa: solo se avisa con certeza.
export function webViewObsoleto(userAgent: string, minimo: number = CHROMIUM_MINIMO): boolean {
  const version = versionChromium(userAgent);
  return version !== null && version < minimo;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test --workspace apps/kiosk`
Expected: PASS.

- [ ] **Step 5: Componente y layout**

`apps/kiosk/components/GuardaWebView.tsx` (estilos **en línea** a propósito, sin clases de Tailwind; sin `inset`/`gap` por compatibilidad con WebView viejo):

```tsx
"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { webViewObsoleto } from "@/lib/versionWebView";

const sinSuscripcion = () => () => {};
const esObsoleto = () => webViewObsoleto(navigator.userAgent);
const nuncaEnServidor = () => false;

// Si el WebView del TV es demasiado viejo para el CSS del kiosco, en vez de una pantalla rota se muestra
// cómo arreglarlo. Estilos en línea: este aviso debe verse justo cuando el CSS de Tailwind NO funciona.
export function GuardaWebView({ children }: { children: ReactNode }) {
  const obsoleto = useSyncExternalStore(sinSuscripcion, esObsoleto, nuncaEnServidor);
  if (!obsoleto) return <>{children}</>;

  return (
    <main
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px",
        textAlign: "center",
        background: "#0a0d07",
        color: "#f3f6ec",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "48px", margin: "0 0 24px 0" }}>Actualiza el WebView del sistema</h1>
      <p style={{ fontSize: "28px", margin: 0, maxWidth: "900px", lineHeight: 1.4 }}>
        Este televisor tiene una versión antigua de «Android System WebView». Ábrela en Google Play, actualízala y
        vuelve a abrir el kiosco.
      </p>
    </main>
  );
}
```

En `apps/kiosk/app/layout.tsx`: añadir `import { GuardaWebView } from "../components/GuardaWebView";` junto a los otros imports y envolver únicamente `{children}`: reemplazar la línea `{children}` del `<body>` por `<GuardaWebView>{children}</GuardaWebView>` (dejar `<ThemeStyleTag ... />` y `<RegistrarServiceWorker />` donde están).

- [ ] **Step 6: Verificar**

Run: `npm test --workspace apps/kiosk` → Expected: PASS.
Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.
Run: `npm run lint --workspace apps/kiosk` → Expected: 0 errores (el aviso de fuentes ya existía).
Run: `NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build --workspace apps/kiosk` → Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/lib/versionWebView.ts apps/kiosk/lib/versionWebView.test.ts apps/kiosk/components/GuardaWebView.tsx apps/kiosk/app/layout.tsx
git commit -m "avisa en pantalla cuando el WebView del televisor es anterior a Chromium 111"
git push origin main
```

---

### Task 3: Proyecto Capacitor — esqueleto, URL de inicio y página sin conexión

**Files:**
- Create: `apps/kiosk-tv/capacitor/package.json`
- Create: `apps/kiosk-tv/capacitor/package-lock.json` (generado por `npm install`)
- Create: `apps/kiosk-tv/capacitor/.gitignore`
- Create: `apps/kiosk-tv/capacitor/scripts/url.mjs`
- Test: `apps/kiosk-tv/capacitor/scripts/url.test.mjs`
- Create: `apps/kiosk-tv/capacitor/scripts/preparar.mjs`
- Create (generado por `cap add android`): `apps/kiosk-tv/capacitor/android/**`

**Interfaces:**
- Produces:
  - `urlInicio(urlBase: string, clave?: string): string` (en `scripts/url.mjs`): sin clave → `<base>/`; con clave → `<base>/config#clave=<codificada>`.
  - `npm run preparar` (en `apps/kiosk-tv/capacitor/`): lee `KIOSCO_URL` (por defecto `https://kiosco.zipnegocios.com`) y `KIOSCO_CLAVE` (opcional) y genera `capacitor.config.json` y `www/index.html` + `www/offline.html` (todos ignorados por git).
  - `npm run sync` = `preparar` + `cap sync android`; `npm test` = `node --test scripts`.
- Estructura: el proyecto vive en `apps/kiosk-tv/capacitor/` (NO en `apps/kiosk-tv/` directamente) para que el glob de workspaces `apps/*` de la raíz no lo tome y los Dockerfiles existentes sigan funcionando.

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk-tv/capacitor/scripts/url.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { urlInicio } from "./url.mjs";

test("sin clave abre la raíz del kiosco", () => {
  assert.equal(urlInicio("https://kiosco.zipnegocios.com"), "https://kiosco.zipnegocios.com/");
  assert.equal(urlInicio("https://kiosco.zipnegocios.com", ""), "https://kiosco.zipnegocios.com/");
});

test("con clave abre /config con la clave en el fragmento", () => {
  assert.equal(urlInicio("https://kiosco.zipnegocios.com", "abc123"), "https://kiosco.zipnegocios.com/config#clave=abc123");
});

test("normaliza las barras finales de la base", () => {
  assert.equal(urlInicio("https://kiosco.zipnegocios.com///", "k"), "https://kiosco.zipnegocios.com/config#clave=k");
  assert.equal(urlInicio("https://kiosco.zipnegocios.com/"), "https://kiosco.zipnegocios.com/");
});

test("codifica los caracteres especiales de la clave", () => {
  assert.equal(urlInicio("https://x.test", "a+b/c=d&e#f g"), "https://x.test/config#clave=a%2Bb%2Fc%3Dd%26e%23f%20g");
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd apps/kiosk-tv/capacitor && node --test scripts`
(si la carpeta aún no tiene `package.json`, crearla primero con `mkdir -p apps/kiosk-tv/capacitor/scripts`; el comando funciona sin él.)
Expected: FAIL — no se puede importar `./url.mjs`.

- [ ] **Step 3: Implementar `url.mjs`**

`apps/kiosk-tv/capacitor/scripts/url.mjs`:

```js
// URL con la que la APK abre el kiosco. La clave de la sucursal va en el fragmento (#clave=...), que no
// viaja al servidor: la página /config del kiosco la guarda y pasa a la pantalla de check-in.
export function urlInicio(urlBase, clave) {
  const base = urlBase.replace(/\/+$/, "");
  return clave ? `${base}/config#clave=${encodeURIComponent(clave)}` : `${base}/`;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd apps/kiosk-tv/capacitor && node --test scripts`
Expected: PASS (4 tests).

- [ ] **Step 5: `package.json` y dependencias**

Averiguar las versiones estables más recientes: `npm view @capacitor/core version`, `npm view @capacitor/cli version`, `npm view @capacitor/android version` (deben coincidir en versión mayor). Crear `apps/kiosk-tv/capacitor/package.json` (sustituir `<VERSION>` por la versión encontrada, con `^`):

```json
{
  "name": "kiosk-tv-capacitor",
  "private": true,
  "version": "0.1.0",
  "description": "Cáscara Capacitor de Android TV para el kiosco (abre el kiosco remoto).",
  "scripts": {
    "preparar": "node scripts/preparar.mjs",
    "sync": "node scripts/preparar.mjs && cap sync android",
    "test": "node --test scripts"
  },
  "dependencies": {
    "@capacitor/android": "^<VERSION>",
    "@capacitor/core": "^<VERSION>"
  },
  "devDependencies": {
    "@capacitor/cli": "^<VERSION>"
  }
}
```

Run: `cd apps/kiosk-tv/capacitor && npm install` (genera `package-lock.json` propio; NO ejecutar `npm install` en la raíz del repo).
Expected: instala sin errores. Comprobar que el `package-lock.json` raíz **no** cambió (`git status` no debe mostrarlo modificado).

- [ ] **Step 6: `preparar.mjs` y `.gitignore`**

`apps/kiosk-tv/capacitor/scripts/preparar.mjs`:

```js
// Genera lo que Capacitor necesita a partir de variables de entorno (nada de esto se versiona):
//   capacitor.config.json  → app remota: abre urlInicio(KIOSCO_URL, KIOSCO_CLAVE)
//   www/index.html         → Capacitor exige un webDir aunque la app sea remota
//   www/offline.html       → página local si el primer arranque no tiene red; reintenta sola
// Variables: KIOSCO_URL (por defecto https://kiosco.zipnegocios.com) y KIOSCO_CLAVE (opcional).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { urlInicio } from "./url.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const inicio = urlInicio(process.env.KIOSCO_URL || "https://kiosco.zipnegocios.com", process.env.KIOSCO_CLAVE || "");

const pagina = (titulo, mensaje, demoraMs) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;background:#0a0d07;color:#f3f6ec;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div><h1 style="font-size:48px;margin:0 0 24px 0">${titulo}</h1><p style="font-size:28px;margin:0">${mensaje}</p></div>
<script>setTimeout(function () { location.href = ${JSON.stringify(inicio)}; }, ${demoraMs});</script>
</body></html>
`;

mkdirSync(join(raiz, "www"), { recursive: true });
writeFileSync(join(raiz, "www", "index.html"), pagina("Kiosco", "Abriendo…", 0));
writeFileSync(join(raiz, "www", "offline.html"), pagina("Sin conexión", "Reintentando…", 10_000));

const configuracion = {
  appId: "com.adrenalina.kiosco",
  appName: "Kiosco AX",
  webDir: "www",
  server: { url: inicio, cleartext: false, errorPath: "offline.html" },
  android: { allowMixedContent: false },
};
writeFileSync(join(raiz, "capacitor.config.json"), `${JSON.stringify(configuracion, null, 2)}\n`);

console.log("Preparado. URL de inicio:", process.env.KIOSCO_CLAVE ? inicio.replace(/#clave=.*/, "#clave=***") : inicio);
```

`apps/kiosk-tv/capacitor/.gitignore`:

```
node_modules/
www/
capacitor.config.json
salida/
```

- [ ] **Step 7: Verificar `errorPath` y generar el proyecto Android**

Comprobar que la versión instalada de Capacitor soporta `server.errorPath`: `grep -rn "errorPath" apps/kiosk-tv/capacitor/node_modules/@capacitor/cli/dist/declarations.d.ts`. Si **no** aparece, quitar `errorPath` de `capacitor.config.json` generado (borrarlo en `preparar.mjs`), y anotar en el reporte: la Task 4 implementará el respaldo en `MainActivity` (ver su Step 4b).

Run: `cd apps/kiosk-tv/capacitor && node scripts/preparar.mjs && npx cap add android`
Expected: crea `android/` (proyecto Gradle con `app/`, `capacitor-cordova-android-plugins/`, etc.) y copia `www/` a `android/app/src/main/assets/public`. No requiere Android SDK; si `cap add` intenta ejecutar Gradle y falla por falta de SDK, reportar el mensaje exacto (no instalar nada).

Run: `node scripts/preparar.mjs` y revisar que `capacitor.config.json` contiene `"url": "https://kiosco.zipnegocios.com/"` (sin clave) y que `www/offline.html` redirige a esa URL.

- [ ] **Step 8: Verificar y commit**

Run: `cd apps/kiosk-tv/capacitor && npm test` → Expected: PASS (4 tests).
Run: `git status --short` → Expected: solo archivos nuevos bajo `apps/kiosk-tv/capacitor/` (sin `node_modules/`, `www/`, `capacitor.config.json`) y ningún cambio en `package-lock.json` raíz ni en otros workspaces. Si `android/` incluye artefactos de compilación o `local.properties`, no agregarlos (el `.gitignore` que genera Capacitor dentro de `android/` los excluye; revisar).

```bash
git add apps/kiosk-tv/capacitor
git commit -m "agrega el proyecto Capacitor de Android TV que abre el kiosco remoto"
git push origin main
```

---

### Task 4: Proyecto Android — manifest de TV, modo inmersivo, banner y firma fija

**Files:**
- Modify: `apps/kiosk-tv/capacitor/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/kiosk-tv/capacitor/android/app/src/main/java/com/adrenalina/kiosco/MainActivity.java`
- Create: `apps/kiosk-tv/capacitor/scripts/generar-banner.ps1`
- Create: `apps/kiosk-tv/capacitor/android/app/src/main/res/drawable-xhdpi/banner.png` (generado)
- Create: `apps/kiosk-tv/capacitor/android/app/debug.keystore` (generado)
- Modify: `apps/kiosk-tv/capacitor/android/app/build.gradle`

**Interfaces:**
- Consumes: el proyecto Android generado en la Task 3 (`appId` `com.adrenalina.kiosco`).
- Produces: un proyecto que Gradle puede compilar como APK de debug firmado con una llave fija, instalable en Android TV (aparece en el launcher de TV) y que al abrir queda a pantalla completa y encendido.
- Esta tarea **no se puede compilar localmente** (sin Android SDK): se valida en la Task 5. Revisar con cuidado la sintaxis XML/Java/Gradle.

- [ ] **Step 1: Leer los archivos generados**

Leer `AndroidManifest.xml`, `MainActivity.java` y `app/build.gradle` generados por `cap add android` (la ruta de `MainActivity.java` depende del `appId`; confirmarla con `find apps/kiosk-tv/capacitor/android -name MainActivity.java`). Los pasos siguientes editan esos archivos conservando todo lo demás.

- [ ] **Step 2: Manifest para Android TV**

En `AndroidManifest.xml`:
1. Dentro de `<manifest ...>` (antes de `<application>`), añadir:

```xml
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
```
2. En la etiqueta `<application ...>` añadir los atributos `android:banner="@drawable/banner"` y `android:usesCleartextTraffic="false"` (si `usesCleartextTraffic` ya existe, dejarlo en `false`).
3. En la `<activity ...>` principal (`MainActivity`) añadir `android:screenOrientation="sensorLandscape"` y, dentro de su `<intent-filter>` que ya tiene `android.intent.action.MAIN` y `android.intent.category.LAUNCHER`, añadir una línea más (sin quitar la existente):

```xml
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
```
4. Confirmar que existe `<uses-permission android:name="android.permission.INTERNET" />` (Capacitor lo trae); no añadir otros permisos.

- [ ] **Step 3: `MainActivity.java`**

Reemplazar el contenido de `MainActivity.java` por (conservar el `package` que tenga el archivo generado, debe ser `com.adrenalina.kiosco`):

```java
package com.adrenalina.kiosco;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // El TV del kiosco no debe apagar la pantalla ni mostrar barras del sistema.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ocultarBarras();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            ocultarBarras();
        }
    }

    private void ocultarBarras() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }
}
```

- [ ] **Step 4b (solo si en la Task 3 `errorPath` NO estaba soportado): respaldo de página sin conexión**

Si el reporte de la Task 3 dice que `server.errorPath` no existe en esta versión de Capacitor, añadir en `MainActivity.onCreate`, después de `ocultarBarras();`, un `WebViewClient` que delegue en el de Capacitor y cargue `file:///android_asset/public/offline.html` cuando falle la carga del documento principal (`onReceivedError` con `request.isForMainFrame()`), dejando el resto del comportamiento de Capacitor intacto (heredar de `com.getcapacitor.BridgeWebViewClient`). Documentar en el reporte exactamente qué se hizo. Si `errorPath` sí está soportado, omitir este paso.

- [ ] **Step 5: Banner de Android TV**

`apps/kiosk-tv/capacitor/scripts/generar-banner.ps1` (usa System.Drawing, incluido en Windows; dibuja el escudo centrado sobre el fondo del tema):

```powershell
# Genera el banner de 320x180 que muestra el launcher de Android TV, a partir del escudo del kiosco.
param(
  [string]$Logo = "$PSScriptRoot\..\..\..\kiosk\public\branding\adrenalina-gym-bg.png",
  [string]$Salida = "$PSScriptRoot\..\android\app\src\main\res\drawable-xhdpi\banner.png"
)
Add-Type -AssemblyName System.Drawing
$logo = [System.Drawing.Image]::FromFile((Resolve-Path $Logo))
$lienzo = New-Object System.Drawing.Bitmap 320, 180
$g = [System.Drawing.Graphics]::FromImage($lienzo)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#0a0d07"))
$lado = 170
$g.DrawImage($logo, (320 - $lado) / 2, (180 - $lado) / 2, $lado, $lado)
New-Item -ItemType Directory -Force (Split-Path $Salida) | Out-Null
$lienzo.Save($Salida, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $lienzo.Dispose(); $logo.Dispose()
Write-Host "Banner generado: $Salida"
```

Run (PowerShell): `powershell -File apps/kiosk-tv/capacitor/scripts/generar-banner.ps1`
Expected: crea `banner.png` de 320×180. Verificar con `file` o leyendo el PNG (debe ser 320x180).

- [ ] **Step 6: Firma de debug fija**

Run (genera la llave una sola vez; JDK 8 trae `keytool`):

```bash
keytool -genkeypair -v -keystore apps/kiosk-tv/capacitor/android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
```
Expected: crea `debug.keystore`. (Es una llave de debug sin valor secreto; es público a propósito, ver Global Constraints.)

En `apps/kiosk-tv/capacitor/android/app/build.gradle`, dentro del bloque `android { ... }`, añadir (respetando los bloques que ya existan; si ya hay `signingConfigs` o `buildTypes`, fusionar en lugar de duplicar):

```gradle
    signingConfigs {
        debug {
            storeFile file("debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
    }
```

Comprobar que `.gitignore` de `android/` (generado por Capacitor) **no** ignora `*.keystore`; si lo hace, añadir `!app/debug.keystore` en ese archivo para que se versione.

- [ ] **Step 7: Verificación estática**

No hay Android SDK: revisar a ojo que (a) el XML del manifest está bien formado (`python -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" <ruta al manifest>` debe terminar sin error), (b) `MainActivity.java` tiene `package com.adrenalina.kiosco;` y las llaves cuadran, (c) `build.gradle` no tiene bloques `android { }` duplicados, (d) `git status` muestra `banner.png` y `debug.keystore` como archivos a versionar. Reportar el resultado de cada punto.

- [ ] **Step 8: Commit**

```bash
git add apps/kiosk-tv/capacitor/android apps/kiosk-tv/capacitor/scripts/generar-banner.ps1
git commit -m "ajusta el proyecto Android para Android TV con pantalla completa, banner y firma fija"
git push origin main
```

---

### Task 5: GitHub Actions — compilar y publicar el APK (cifrado si lleva clave)

**Files:**
- Create: `.github/workflows/apk-kiosco.yml`

**Interfaces:**
- Consumes: `npm run sync` (Task 3), el proyecto Android (Task 4), secretos `KIOSCO_CLAVE_<SUCURSAL>` y `KIOSCO_APK_PASSWORD`.
- Produces: workflow `workflow_dispatch` "Compilar APK del kiosco" con entradas `sucursal` y `kiosco_url`; artefacto `kiosco-<sucursal>` con `kiosco-<sucursal>.apk` (sin clave) o `kiosco-<sucursal>.7z` cifrado (con clave).

- [ ] **Step 1: Determinar la versión de Java**

Leer qué JDK exige la versión instalada de `@capacitor/android`: `grep -rn "JavaVersion\|VERSION_" apps/kiosk-tv/capacitor/node_modules/@capacitor/android/capacitor/build.gradle apps/kiosk-tv/capacitor/android/app/capacitor.build.gradle`. Capacitor 6 usa Java 17; Capacitor 7 en adelante usa Java 21. Usar ese valor como `JAVA_VERSION` en el workflow (si hay duda, 21 con la versión más reciente de Capacitor).

- [ ] **Step 2: Crear el workflow**

`.github/workflows/apk-kiosco.yml` (sustituir `<JAVA_VERSION>` por el valor del Step 1):

```yaml
name: Compilar APK del kiosco

# El repositorio es público: un artefacto lo puede descargar cualquiera. Un APK con la clave de la sucursal
# dentro SOLO se publica cifrado (7-Zip AES-256). Sin clave (prueba) se publica el APK genérico.
on:
  workflow_dispatch:
    inputs:
      sucursal:
        description: "Nombre corto de la sucursal (minúsculas, números y _). Su clave es el secreto KIOSCO_CLAVE_<SUCURSAL>"
        required: true
        default: principal
      kiosco_url:
        description: "URL del kiosco"
        required: true
        default: https://kiosco.zipnegocios.com

permissions:
  contents: read

jobs:
  apk:
    runs-on: ubuntu-latest
    env:
      SUCURSAL: ${{ inputs.sucursal }}
      KIOSCO_URL: ${{ inputs.kiosco_url }}
      KIOSCO_CLAVE: ${{ secrets[format('KIOSCO_CLAVE_{0}', inputs.sucursal)] }}
      APK_PASSWORD: ${{ secrets.KIOSCO_APK_PASSWORD }}
    steps:
      - name: Validar la sucursal
        run: |
          if ! [[ "$SUCURSAL" =~ ^[a-z0-9_]+$ ]]; then
            echo "Sucursal inválida: usa solo minúsculas, números y _"
            exit 1
          fi

      - name: Enmascarar la clave en los logs
        run: |
          if [ -n "$KIOSCO_CLAVE" ]; then echo "::add-mask::$KIOSCO_CLAVE"; fi

      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/kiosk-tv/capacitor/package-lock.json

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: <JAVA_VERSION>

      - uses: android-actions/setup-android@v3

      - name: Instalar dependencias de Capacitor
        working-directory: apps/kiosk-tv/capacitor
        run: npm ci

      - name: Probar los scripts
        working-directory: apps/kiosk-tv/capacitor
        run: npm test

      - name: Preparar y sincronizar (inyecta la URL y la clave)
        working-directory: apps/kiosk-tv/capacitor
        run: npm run sync

      - name: Compilar el APK de debug
        working-directory: apps/kiosk-tv/capacitor/android
        run: ./gradlew assembleDebug --no-daemon

      - name: Preparar el archivo a publicar
        working-directory: apps/kiosk-tv/capacitor
        run: |
          mkdir -p salida
          cp android/app/build/outputs/apk/debug/app-debug.apk "salida/kiosco-${SUCURSAL}.apk"
          if [ -n "$KIOSCO_CLAVE" ]; then
            if [ -z "$APK_PASSWORD" ]; then
              echo "Falta el secreto KIOSCO_APK_PASSWORD: no se publica un APK con clave sin cifrar."
              exit 1
            fi
            sudo apt-get install -y -q p7zip-full
            (cd salida && 7z a -t7z -mhe=on -p"$APK_PASSWORD" "kiosco-${SUCURSAL}.7z" "kiosco-${SUCURSAL}.apk" > /dev/null && rm "kiosco-${SUCURSAL}.apk")
            # Guarda de seguridad: con clave no puede quedar ningún .apk sin cifrar para subir.
            if ls salida/*.apk > /dev/null 2>&1; then
              echo "Quedó un APK sin cifrar en salida/: se aborta."
              exit 1
            fi
          fi
          ls -l salida

      - uses: actions/upload-artifact@v4
        with:
          name: kiosco-${{ inputs.sucursal }}
          path: apps/kiosk-tv/capacitor/salida/*
          retention-days: 7
          if-no-files-found: error
```

- [ ] **Step 3: Validar la sintaxis localmente**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/apk-kiosco.yml', encoding='utf-8')); print('yaml ok')"` (si PyYAML no está instalado, usar `node -e "require('fs').readFileSync('.github/workflows/apk-kiosco.yml','utf8'); console.log('leído')"` y revisar la indentación a ojo).
Expected: sin error.

- [ ] **Step 4: Publicar y probar la compilación sin clave (APK genérico)**

```bash
git add .github/workflows/apk-kiosco.yml
git commit -m "agrega el workflow que compila el APK del kiosco y lo cifra cuando lleva clave"
git push origin main
```
(Si el push es rechazado por el permiso `workflow` del token, reportar BLOCKED con el mensaje exacto.)

Run: `gh workflow run apk-kiosco.yml -f sucursal=prueba` y luego `gh run list --workflow apk-kiosco.yml --limit 1` para obtener el `id` y `gh run watch <id> --exit-status`.
Expected: el workflow termina en éxito. **No existe el secreto `KIOSCO_CLAVE_PRUEBA`**, así que `KIOSCO_CLAVE` queda vacía y se publica `kiosco-prueba.apk` sin cifrar (es seguro: no lleva clave).

Si falla, leer `gh run view <id> --log-failed`, corregir la causa (versión de Java, firma, rutas, sintaxis de Gradle o del manifest de la Task 4), hacer un commit por cada corrección (`git push origin main`) y relanzar. Repetir hasta que quede en verde. Reportar cada causa encontrada y el arreglo (los archivos de Tasks 3 y 4 pueden necesitar ajustes; está permitido tocarlos para que compile).

- [ ] **Step 5: Comprobar el APK descargado**

Run: `gh run download <id> -n kiosco-prueba -D "$TEMP/apk-prueba"` y luego `unzip -l "$TEMP/apk-prueba/kiosco-prueba.apk" | head -30`.
Expected: el archivo existe, es un ZIP válido y contiene `AndroidManifest.xml`, `classes.dex` y `assets/public/` (con `offline.html` e `index.html`). Verificar también que **no** contiene ninguna clave real: `unzip -p ... assets/capacitor.config.json` debe mostrar `"url": "https://kiosco.zipnegocios.com/"` (sin `#clave=`). Borrar `$TEMP/apk-prueba` al terminar.

- [ ] **Step 6: Confirmar (sin ejecutar) la ruta cifrada**

La ruta con clave (cifrado 7z) **no se puede probar sin los secretos reales del usuario**. Dejarlo anotado en el reporte como "no verificado", con la instrucción de que el usuario la pruebe tras crear los secretos (Task 6, lista de verificación). No crear secretos ni contraseñas de prueba en el repositorio.

---

### Task 6: Documentación, guía de uso y handoff

**Files:**
- Create: `apps/kiosk-tv/README.md`
- Modify: `handoff.md`

- [ ] **Step 1: Escribir `apps/kiosk-tv/README.md`**

Contenido (en español, conciso), con estas secciones:
1. **Qué es:** APK de Android TV que abre `https://kiosco.zipnegocios.com`; una por sucursal con la clave dentro; cómo funciona (`/config#clave=...`).
2. **Requisitos del TV:** Android TV / Google TV, **Android System WebView ≥ 111** (si es menor el kiosco muestra el aviso; actualizarlo desde Google Play), numpad USB con **Num Lock encendido**.
3. **Preparación única (en GitHub, Settings → Secrets and variables → Actions → New repository secret):** `KIOSCO_APK_PASSWORD` (contraseña del `.7z`, la inventa el usuario) y `KIOSCO_CLAVE_<SUCURSAL>` con la API key de la sede (nombre en MAYÚSCULAS, solo letras, números y `_`; ejemplo `KIOSCO_CLAVE_PRINCIPAL`). Instalar 7-Zip en la PC.
4. **Compilar el APK de una sede:** Actions → "Compilar APK del kiosco" → Run workflow → `sucursal` en minúsculas (ejemplo `principal`) → esperar → descargar el artefacto `kiosco-principal` → abrir el `.7z` con 7-Zip y la contraseña → `kiosco-principal.apk`.
5. **Instalar en el TV:** por USB (copiar el APK, abrir con un explorador de archivos del TV y permitir "fuentes desconocidas") o con `adb install -r kiosco-principal.apk` (`-r` actualiza encima: misma firma). Se abre desde el launcher de TV con el icono "Kiosco AX".
6. **Rotar una clave:** actualizar el secreto `KIOSCO_CLAVE_<SEDE>`, volver a compilar e instalar con `adb install -r`.
7. **Prueba sin clave:** correr el workflow con una sucursal sin secreto produce un APK genérico sin cifrar (abre `/config` para pegar la clave a mano).
8. **Lista de verificación en el TV real:** abre a pantalla completa; el numpad escribe (Num Lock), Enter registra; la pantalla no se apaga; sin red al arrancar muestra "Sin conexión" y reintenta; con WebView viejo muestra el aviso; la ficha de reposo y el flip se ven bien y el tamaño de texto es legible (si el TV reporta 960×540, ajustar `html { font-size }` en `apps/kiosk/app/globals.css`); que al reiniciar el TV hay que abrir la app a mano (el arranque automático no está implementado: Android 10+ lo limita).
9. **Seguridad:** el repo es público; el APK con clave **solo** se publica cifrado; nunca subir un APK descifrado ni pegar la clave en issues, commits o logs.

- [ ] **Step 2: Actualizar `handoff.md`**

Con los 5 apartados de CLAUDE.md: en "Estado actual", añadir un bullet de la Fase 3 (qué existe: kiosco web con `#clave=` y aviso de WebView; proyecto Capacitor en `apps/kiosk-tv/capacitor/`; workflow `.github/workflows/apk-kiosco.yml`; compilación verificada en Actions **sin clave**; la ruta cifrada y la instalación en un TV real **sin verificar**); en "Archivos y cambios", listar los archivos de este plan; en "Intentos fallidos", **añadir** (sin borrar nada) lo que no haya funcionado durante la ejecución (por ejemplo errores de compilación en Actions y su causa) y las decisiones: no compilar localmente (PC sin recursos), repo público ⇒ APK cifrado, llave de debug fija pública; en "Próximos pasos", crear los secretos (`KIOSCO_APK_PASSWORD`, `KIOSCO_CLAVE_<SEDE>`), correr el workflow de la sede, probar en el TV real con la lista del README, y los pendientes anteriores (desplegar kiosco, recodificar el video, `@layer`/WebView). Actualizar la mención de F3 en la entrada del rediseño.

- [ ] **Step 3: Commit**

```bash
git add apps/kiosk-tv/README.md handoff.md
git commit -m "documenta la compilación e instalación del APK del kiosco y actualiza el handoff"
git push origin main
```

---

## Self-Review (hecha al escribir el plan)

- **Cobertura del spec F3 (§9, §10):** `#clave=` en `/config` → Task 1; aviso de WebView < 111 → Task 2; proyecto Capacitor remoto con `offline.html` y URL de inicio con clave → Task 3; manifest de TV, pantalla encendida, inmersivo, banner, firma fija, orientación → Task 4; compilación en Actions, cifrado AES-256 con 7-Zip, guarda contra publicar sin cifrar → Task 5; guía de uso y handoff → Task 6. El arranque automático al encender queda explícitamente fuera (Android 10+), documentado como prueba pendiente.
- **Sin marcadores pendientes:** el código de JS, YAML, XML, Java, Gradle y PowerShell va completo; los dos puntos que dependen de la versión de Capacitor (`<VERSION>`, `<JAVA_VERSION>`, `errorPath`) llevan el comando exacto para resolverlos y el plan de respaldo (Step 4b).
- **Consistencia de nombres:** `claveDeFragmento` (Task 1) ↔ formato `#clave=` que genera `urlInicio` (Task 3); `appId` `com.adrenalina.kiosco` coincide en `preparar.mjs`, `MainActivity.java` y el README; el secreto `KIOSCO_CLAVE_<SUCURSAL>` coincide entre el workflow y el README; `npm run sync` (Task 3) lo usa el workflow (Task 5).
- **Riesgos:** (1) la compilación de Android solo se verifica en Actions y puede requerir varias iteraciones; (2) la ruta cifrada y el comportamiento en un TV real (WebView, Num Lock, `errorPath`/navegación desde la página local) no se pueden verificar aquí; (3) un APK descifrado contiene la clave: con acceso físico al TV podría extraerse (aceptado por el usuario); (4) el push de `.github/workflows` puede ser rechazado si el token no tiene el permiso `workflow`.
