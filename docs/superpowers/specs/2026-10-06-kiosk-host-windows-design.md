# Host de escritorio Windows para el kiosco (teclado numérico exclusivo) — diseño

Fecha: 2026-10-06. Extiende `apps/kiosk` (PWA de check-in, ver plan `2026-09-13-app-kiosco.md`) y concreta el "envolver en nativo más adelante" del ADR-001 §2.5.

## Objetivo
Que el teclado numérico dedicado del kiosco alimente **solo** la pantalla del kiosco, sin importar qué ventana tenga el foco de Windows, mientras el teclado de 102 teclas y el mouse siguen funcionando con normalidad para Windows y las demás apps — y sin que sus teclas lleguen al kiosco.

## Decisiones acordadas con el usuario
- Vía sin driver: **Raw Input** de Windows en un host nativo **C# WinForms + WebView2, .NET 8** (`net8.0-windows`). Prohibido instalar drivers de filtrado (tipo Interception) o pedir permisos de administrador.
- El proyecto vive en `apps/kiosk-host/`, sin `package.json` (npm workspaces y turbo lo ignoran).
- El host carga la **URL ya desplegada** del kiosco, no el export estático local (evita CORS/service worker bajo `file://`; `/api/checkin` ya responde `Access-Control-Allow-Origin: *`).
- URL configurable: variable de entorno `KIOSK_URL` > campo `url` de `kiosk-host.json` > `https://kiosco.zipnegocios.com/`.
- Distribución: exe **autocontenido de un solo archivo** (no requiere .NET en el kiosco, solo el runtime de WebView2) + **inicio con Windows** opcional vía `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Ventana: **sin bordes, maximizada y siempre encima** en uso normal; "modo ventana" redimensionable solo para configuración (reubicar de monitor).
- El host es un **relé de teclas**: la cédula se arma, envía y borra en la web, como hoy.
- Teclado objetivo: **RAIKU K-601** (USB, 23 teclas). Mapeo: `0`–`9` dígito, `Enter` enviar, `←` borrar un dígito, `.`/Del borrar todo; el resto se ignora.
- Sin tests nuevos en `apps/kiosk` (no tiene infraestructura de tests; no se agrega solo para el hook). La lógica sensible (mapeo, vinculación, config) se testea en C#.
- No se tocan `registrarCheckIn`, la cola offline en IndexedDB, `reintentarPendientes`, el service worker, `/config` ni `AccessCard`.

## Limitaciones conocidas (consecuencia de no usar driver)
- Raw Input es **pasivo**: las teclas del numpad también llegan a la app que tenga el foco de Windows. El requisito es que el kiosco las reciba y descarte las del teclado grande, no que las oculte al resto del sistema.
- Las 3 teclas multimedia de la fila superior del K-601 (inicio, correo, calculadora) las ejecuta Windows: abren su app **detrás** del kiosco (TopMost). El kiosco las ignora.
- El estado de NumLock es global de Windows (compartido con el teclado grande); el mapeo por scan code hace que al kiosco no le afecte.

## Arquitectura

```
Numpad K-601 ─┐                       ┌─ WM_INPUT (hDevice, MakeCode, Flags) ─► VentanaKiosco
Teclado 102 ──┤─► Windows (ambos fluyen ┤     ├ filtro: hDevice = numpad vinculado, solo "pulsar", sin autorepetición
              │   a la app con foco)    │     ├ MapeoTeclas (scan code → mensaje)
              └─────────────────────────┘     └ CoreWebView2.PostWebMessageAsJson
                                                    └─► apps/kiosk (desplegado) · useEntradaCedula
                                                          └─► enviar() → registrarCheckIn → POST /api/checkin
```

### Estructura de `apps/kiosk-host/`
| Archivo | Responsabilidad |
|---|---|
| `KioskHost.sln` | Solución con los dos proyectos. |
| `README.md` | Compilar, publicar, instalar, requisito de WebView2, vincular numpad, configurar URL, limitaciones. |
| `src/KioskHost/KioskHost.csproj` | WinExe `net8.0-windows`, `UseWindowsForms`, NuGet `Microsoft.Web.WebView2`. |
| `src/KioskHost/Program.cs` | Arranque: instancia única (Mutex con nombre), carga config, verifica runtime WebView2, abre la ventana. |
| `src/KioskHost/VentanaKiosco.cs` | `Form` con WebView2; modos pantalla completa / ventana; guarda/restaura posición; `WndProc` recibe `WM_INPUT` y `WM_INPUT_DEVICE_CHANGE`; modo aprender. |
| `src/KioskHost/RawInput.cs` | P/Invoke de `user32`: `RegisterRawInputDevices`, `GetRawInputData`, `GetRawInputDeviceInfo` (`RIDI_DEVICENAME`), `GetRawInputDeviceList`. Sin lógica. |
| `src/KioskHost/MapeoTeclas.cs` | **Puro.** `(makeCode, e0, soltar) → TeclaKiosco?` y serialización del mensaje JSON. |
| `src/KioskHost/Vinculacion.cs` | **Puro.** Extrae VID/PID de la ruta; decide si un dispositivo es el vinculado. |
| `src/KioskHost/ConfigHost.cs` | **Puro** (salvo E/S de archivo inyectable por ruta). Lee/escribe `kiosk-host.json`; resuelve la URL. |
| `src/KioskHost/Bandeja.cs` | `NotifyIcon` y su menú. |
| `tests/KioskHost.Tests/KioskHost.Tests.csproj` | xUnit `net8.0-windows`, referencia a `KioskHost`. |
| `tests/KioskHost.Tests/*Tests.cs` | Tests de `MapeoTeclas`, `Vinculacion`, `ConfigHost`. |

`.gitignore` raíz: agregar `apps/kiosk-host/**/bin/` y `apps/kiosk-host/**/obj/`.

## Flujo de entrada (host)

1. **Registro** al crear el handle de la ventana: `RegisterRawInputDevices` con UsagePage `0x01`, Usage `0x06` (teclado), flags `RIDEV_INPUTSINK | RIDEV_DEVNOTIFY`, `hwndTarget` = handle de la ventana. **Sin** `RIDEV_NOLEGACY` (pasivo).
2. **`WM_INPUT`**: `GetRawInputData` → `hDevice`, `MakeCode`, `Flags` (`RI_KEY_E0`, `RI_KEY_BREAK`). El nombre del dispositivo se pide una vez por `hDevice` (`RIDI_DEVICENAME`) y se cachea; la caché se invalida con `WM_INPUT_DEVICE_CHANGE`.
3. **Filtro**: se descarta si el dispositivo no es el vinculado, si es "soltar" (`RI_KEY_BREAK`) o si es **autorepetición** (un "pulsar" de un scan code que ya estaba pulsado; se lleva un conjunto de teclas pulsadas que se limpia en el "soltar").
4. **Mapeo** (`MapeoTeclas`, independiente de VKey → igual con NumLock encendido o apagado):

| Tecla K-601 | MakeCode | E0 | Mensaje |
|---|---|---|---|
| `0` | 0x52 | no | `{"type":"digit","value":"0"}` |
| `1` / `2` / `3` | 0x4F / 0x50 / 0x51 | no | `digit` `1` / `2` / `3` |
| `4` / `5` / `6` | 0x4B / 0x4C / 0x4D | no | `digit` `4` / `5` / `6` |
| `7` / `8` / `9` | 0x47 / 0x48 / 0x49 | no | `digit` `7` / `8` / `9` |
| `Enter` | 0x1C | sí o no | `{"type":"enter"}` |
| `←` (Retroceso) | 0x0E | no | `{"type":"backspace"}` |
| `.` / Del | 0x53 | no | `{"type":"clear"}` |
| cualquier otra (incluidas 0x47–0x53 **con** E0, que son las flechas/Inicio/Supr dedicadas de un teclado completo) | — | — | se ignora |

   `Enter` se acepta con y sin E0 porque algunos numpads baratos envían el Enter principal; como solo se escucha el dispositivo vinculado, no hay riesgo de mezclarlo con el teclado grande.
5. **Envío**: `webView.CoreWebView2.PostWebMessageAsJson(json)`. Nada de `ExecuteScriptAsync` para escribir en el DOM ni de simular teclas.

### Vinculación (`Vinculacion`)
- `kiosk-host.json` guarda `dispositivo: { "ruta": "\\\\?\\HID#VID_xxxx&PID_yyyy&...", "vid": "xxxx", "pid": "yyyy" }`.
- VID/PID se extraen de la ruta (`VID_([0-9A-F]{4})`, `PID_([0-9A-F]{4})`, sin distinguir mayúsculas).
- Un dispositivo es el vinculado si:
  1. su ruta coincide exactamente (sin distinguir mayúsculas), **o**
  2. la ruta no coincide pero su VID/PID sí, y entre los teclados conectados (`GetRawInputDeviceList`) hay **exactamente uno** con ese VID/PID → se acepta y se actualiza `ruta` en el json (caso "lo cambiaron de puerto USB").
- Con cero o varios candidatos por VID/PID (p. ej. dos K-601 idénticos en puertos nuevos) no se acepta ninguno: la bandeja muestra un aviso para re-vincular.

### Modo aprender
- Se entra si no hay `dispositivo` en el json o al elegir "Re-vincular teclado numérico" en la bandeja.
- La web muestra lo de siempre; el host no reenvía teclas. El título de la ventana (visible en modo ventana) y un globo de la bandeja dicen: *"Pulsa Enter en el teclado numérico para vincularlo"*.
- Vincula con el **primer "pulsar" que `MapeoTeclas` traduzca a `enter`**, de cualquier teclado; guarda ruta + VID/PID y sale del modo. El README pide no usar el teclado grande durante la vinculación.

## Ventana y WebView2 (host)

- **Pantalla completa (por defecto)**: `FormBorderStyle.None`, `WindowState.Maximized`, `TopMost = true`, en el monitor guardado. No se puede mover ni achicar.
- **Modo ventana (configuración)**: desde la bandeja; bordes normales, redimensionable y movible, sigue TopMost. Al volver a "Pantalla completa" se maximiza en el monitor donde quedó la ventana.
- `kiosk-host.json` guarda `ventana: { "modo": "completa" | "ventana", "x", "y", "ancho", "alto" }` (los límites del modo ventana; el monitor de pantalla completa se deduce de ellos). Si los límites guardados no caen en ningún monitor conectado, se usa el principal.
- La **X** (visible solo en modo ventana) y Alt+F4 ocultan la ventana a la bandeja; solo "Salir" cierra la app.
- `CoreWebView2Environment` con carpeta de datos `%LOCALAPPDATA%\KioskHost\WebView2` (persisten API key en `localStorage`, cola IndexedDB y service worker).
- `CoreWebView2.Settings`: `AreDefaultContextMenusEnabled = false`, `AreDevToolsEnabled = false`, `IsZoomControlEnabled = false`, `IsPinchZoomEnabled = false`, `IsStatusBarEnabled = false`, `AreBrowserAcceleratorKeysEnabled = false`.
- `NewWindowRequested` → `Handled = true` (no abre ventanas). `NavigationStarting` → cancela si el origen no es el de la URL configurada.

### Menú de bandeja (`Bandeja`)
Mostrar kiosco · Pantalla completa / Modo ventana (configuración) · Re-vincular teclado numérico · Recargar página · Iniciar con Windows (casilla: escribe/borra `HKCU\...\Run\KioskHost` con la ruta del exe) · Salir.

### Configuración (`ConfigHost`)
Archivo `kiosk-host.json` junto al exe (`AppContext.BaseDirectory`):

```json
{
  "url": "https://kiosco.zipnegocios.com/",
  "dispositivo": null,
  "ventana": { "modo": "completa", "x": 100, "y": 100, "ancho": 1024, "alto": 768 }
}
```

- URL efectiva: `KIOSK_URL` (si no está vacía) > `url` > `https://kiosco.zipnegocios.com/`.
- Si el archivo no existe se crea con esos valores. Si es JSON inválido: aviso en un `MessageBox`, se usan los valores por defecto en memoria y **no** se sobrescribe el archivo (para no perder lo que el usuario editó).

## Errores
| Caso | Comportamiento |
|---|---|
| Falta el runtime de WebView2 (`CoreWebView2Environment.GetAvailableBrowserVersionString` lanza) | `MessageBox` con el enlace oficial del instalador Evergreen y la app termina. |
| Sin red al arrancar | Si ya hubo una carga previa, el service worker del kiosco sirve desde caché. Si es la primera vez, WebView2 muestra su página de error; "Recargar página" en la bandeja. |
| Segunda instancia | El Mutex lo detecta; la nueva instancia termina (la existente sigue). |
| Numpad desconectado | Se ignora; al reconectarlo se reconoce por ruta o VID/PID. |
| `PostWebMessageAsJson` antes de que `CoreWebView2` esté listo | La tecla se descarta (no se encola). |

## Lado web (`apps/kiosk`)

### Nuevo `lib/useEntradaCedula.ts`
- Detecta el host con `useSyncExternalStore` sobre `window.chrome?.webview` (snapshot de servidor `false` → sin desajuste de hidratación en el export estático).
- Estado `cedula` + ref espejo (para que "dígito + Enter" muy seguidos lean el valor actual).
- Recibe `{ alEscribir: () => void, alEnviar: (cedula: string) => void }`; los guarda en un ref actualizado en cada render.
- Devuelve `{ cedula, limpiar, nativo, propsInput }`.
- **Fuente nativa**: `chrome.webview.addEventListener("message")`:
  - `digit` (valor `/^\d$/`) → `alEscribir()` y agrega el dígito;
  - `backspace` → `alEscribir()` y quita el último;
  - `clear` → `alEscribir()` y vacía;
  - `enter` → `alEnviar(valorActual)`;
  - otra forma → se ignora.
- **Fuente DOM** (navegador normal / dev): `propsInput` reproduce lo actual — `onChange` filtra `\D` y llama `alEscribir()`, `Enter` → `alEnviar`, `Escape` → vacía, `autoFocus`, re-enfoque en `onBlur` y en cada render.

### `app/page.tsx`
- Usa el hook; se eliminan el `useRef` del input, el `useEffect` de foco (líneas 59-61) y los handlers inline del `<input>`.
- `alEscribir` = lógica actual de limpiar la ficha (`setEstado({ tipo: "esperando" })` si no está esperando/procesando).
- `enviar(cedula: string)` recibe la cédula y al final llama `limpiar()` en vez de `setCedula("")`.
- Modo nativo: muestra la cédula en un `<div>` con el mismo estilo del input (sin `<input>`, sin foco). Modo DOM: `<input {...propsInput} />` como hoy.

## Verificación
- **Host**: `dotnet build` y `dotnet test` (xUnit):
  - `MapeoTeclas`: los 10 dígitos; `Enter` con y sin E0; `←`; `.`/Del; 0x47–0x53 con E0 ignoradas; "soltar" ignorado; teclas no mapeadas ignoradas; JSON exacto de cada mensaje.
  - `Vinculacion`: extracción de VID/PID (mayúsculas/minúsculas, ruta sin VID); ruta exacta; cambio de puerto con un único candidato; dos candidatos → ninguno; cero candidatos → ninguno.
  - `ConfigHost`: prioridad `KIOSK_URL` > `url` > defecto; `KIOSK_URL` vacía se ignora; archivo ausente → se crea; JSON inválido → defaults sin sobrescribir; ida y vuelta de `dispositivo` y `ventana`.
- **Web**: `tsc --noEmit` y `eslint` en `apps/kiosk`; `npm run dev` en navegador normal.
- **Checklist manual con el K-601 real** (en el README):
  1. El numpad escribe en el kiosco aunque otra ventana tenga el foco.
  2. Teclado de 102 teclas y mouse funcionan sin interferencia en otras apps, y sus teclas **no** llegan al kiosco.
  3. Igual con NumLock encendido y apagado; anotar si el K-601 fuerza NumLock.
  4. Re-enchufar el numpad en otro puerto USB mantiene la vinculación (o queda documentado que hay que re-vincular desde la bandeja).
  5. Las teclas multimedia abren su app detrás del kiosco (limitación conocida).
  6. Modo pantalla completa no se puede mover ni achicar; modo ventana sí; se recuerda al reiniciar.
  7. `npm run dev` de `apps/kiosk` sin host sigue funcionando con el teclado normal.

## Fuera de alcance
- Bloquear las teclas del numpad para otras apps o bloquear las teclas multimedia (requiere driver).
- Bloqueo del sistema operativo (Assigned Access, shell personalizado, ocultar barra de tareas).
- Instalador MSI/MSIX, auto-actualización del host y firma de código.
- Tests automatizados del hook web.
