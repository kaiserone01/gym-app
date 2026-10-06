# KioskHost — kiosco de check-in para Windows

App de escritorio (WinForms + WebView2) que muestra el kiosco (`apps/kiosk`, ya desplegado) y le reenvía
**solo** las teclas del teclado numérico vinculado, sin importar qué ventana tenga el foco de Windows.
El teclado normal y el mouse siguen funcionando con normalidad en el resto de las apps, y sus teclas no
llegan al kiosco. No usa drivers ni requiere permisos de administrador.

Diseño: `docs/superpowers/specs/2026-10-06-kiosk-host-windows-design.md`.

## Requisitos
- Windows 10 u 11 de 64 bits.
- **Runtime de Microsoft Edge WebView2.** Viene con Windows 11 y con Windows 10 actualizado. Si falta, el
  kiosco lo avisa al abrir; se instala por usuario desde https://go.microsoft.com/fwlink/p/?LinkId=2124703
  (no tiene relación con drivers).
- Para compilar: SDK de .NET 8 (instalación por usuario, sin admin):
  ```powershell
  Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile "$env:TEMP\dotnet-install.ps1"
  & "$env:TEMP\dotnet-install.ps1" -Channel 8.0 -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet"
  $env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"   # en cada consola nueva
  ```

## Compilar, probar y correr
```powershell
dotnet build apps/kiosk-host/KioskHost.sln
dotnet test apps/kiosk-host/KioskHost.sln
dotnet run --project apps/kiosk-host/src/KioskHost
```
Si el exe de `bin\Debug` (depende del runtime de .NET 8) no arranca porque el sistema solo tiene otro
runtime (p. ej. .NET 6 en `Program Files`), definir antes
`$env:DOTNET_ROOT = "$env:LOCALAPPDATA\Microsoft\dotnet"`. `dotnet run` y el exe publicado
(autocontenido) no lo necesitan.

## Publicar e instalar en el PC del kiosco
```powershell
dotnet publish apps/kiosk-host/src/KioskHost -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publicado
```
Genera un único `publicado\KioskHost.exe` autocontenido (~155 MB, no requiere instalar .NET; el resto de
archivos de la carpeta —`.pdb`, `.xml`— no hacen falta). `WebView2Loader.dll` queda embebida en el exe:
verificado copiando solo el exe a una carpeta vacía.
1. Copiar `publicado\KioskHost.exe` a `%LOCALAPPDATA%\KioskHost\` (una carpeta del usuario, para que el
   kiosco pueda escribir su `kiosk-host.json` al lado; **no** usar `Program Files`).
2. El exe no está firmado:
   - si llegó descargado (navegador, chat, correo), quitarle la marca de "descargado de Internet":
     `Unblock-File "$env:LOCALAPPDATA\KioskHost\KioskHost.exe"`, o clic derecho → Propiedades → casilla
     **Desbloquear** → Aceptar;
   - al primer arranque **SmartScreen** puede mostrar "Windows protegió su PC": **Más información** →
     **Ejecutar de todas formas**. No pide admin.
3. Abrirlo, configurar la API key de la sucursal (bandeja → **Abrir configuración**) y vincular el numpad
   (ver abajo).
4. Bandeja → marcar **Iniciar con Windows** (escribe en `HKCU\...\Run`, sin admin).

## Vincular el teclado numérico (primera vez o al cambiarlo)
1. Si no hay numpad vinculado, el kiosco abre en **modo ventana** con el título *"Para vincular el
   teclado numérico pulsa 1, 2, 3 y Enter en él"*. Para re-vincular: bandeja → **Re-vincular teclado
   numérico**.
2. **Arrastrar la ventana al monitor del kiosco** (al vincular se maximiza en el monitor donde esté).
3. En el teclado numérico, pulsar **1, 2, 3, Enter**. Se vincula el primer teclado que complete la
   secuencia: no la tecleen en el numpad del teclado grande.
4. Aparece el globo *"Teclado numérico vinculado (VID xxxx, PID yyyy)"*, la bandeja muestra
   *"Estado: vinculado VID xxxx PID yyyy"* y el kiosco vuelve a pantalla completa.

Si se enchufa el numpad en **otro puerto USB**, el kiosco lo reconoce solo (mismo modelo e interfaz,
único conectado). Si hay dos numpads idénticos conectados, avisa y hay que re-vincular.

## Teclas (RAIKU K-601)
| Tecla | Acción |
|---|---|
| `0`–`9` | dígito (igual con Num Lock encendido o apagado) |
| `Enter` | enviar |
| `←` | borrar un dígito |
| `.` / Del | borrar todo |
| resto | se ignora |

## Configuración — `kiosk-host.json` (junto al exe)
```json
{
  "url": "https://kiosco.zipnegocios.com/",
  "dispositivo": null,
  "ventana": { "modo": "completa", "x": 100, "y": 100, "ancho": 1024, "alto": 768 }
}
```
- **URL del kiosco por entorno:** la variable de entorno `KIOSK_URL` tiene prioridad sobre `url`; si
  ninguna es una URL http(s) válida se usa `https://kiosco.zipnegocios.com/`. Ejemplos:
  - staging en un equipo: `setx KIOSK_URL https://kiosco-staging.ejemplo/` (por usuario, sin admin; vale
    para los procesos que se abran después);
  - desarrollo: `$env:KIOSK_URL = "http://localhost:3001/"; dotnet run --project apps/kiosk-host/src/KioskHost`.
- `dispositivo` y `ventana` los escribe el kiosco; no hace falta editarlos.
- Si el archivo no es JSON válido, el kiosco avisa, usa los valores por defecto y no lo sobrescribe.
- Los datos del navegador (API key, cola offline) viven en `%LOCALAPPDATA%\KioskHost\WebView2`.

## Menú de la bandeja
Estado · Mostrar kiosco · Pantalla completa · Modo ventana (configuración) · Re-vincular teclado numérico ·
Abrir configuración · Recargar página · Iniciar con Windows · Salir.
La X de la ventana y Alt+F4 solo la ocultan en la bandeja; para cerrar el kiosco: **Salir**.

## Limitaciones conocidas (no se usan drivers)
- Las teclas del numpad **también** llegan a la app que tenga el foco de Windows (Raw Input es pasivo).
- Las 3 teclas multimedia de la fila superior del K-601 (inicio, correo, calculadora) las ejecuta Windows:
  abren su app **detrás** del kiosco.
- El estado de Num Lock es compartido con el teclado grande (al kiosco no le afecta).

## Checklist de validación (con el K-601 real)
1. El numpad escribe en el kiosco aunque otra ventana tenga el foco.
2. Teclado de 102 teclas y mouse funcionan sin interferencia en otras apps, y sus teclas **no** llegan al kiosco.
3. Igual con Num Lock encendido y apagado (anotar si el K-601 fuerza Num Lock).
4. Re-enchufar el numpad en otro puerto USB mantiene la vinculación (o queda anotado que hay que re-vincular).
5. Las teclas multimedia abren su app detrás del kiosco.
6. Pantalla completa no se puede mover ni achicar; modo ventana sí; se recuerda al reiniciar.
7. `npm run dev` de `apps/kiosk` sin el host sigue funcionando con el teclado normal.
8. Sin vincular, arranca en modo ventana. Arrastrar la ventana al monitor del kiosco antes de pulsar
   1, 2, 3, Enter: muestra el globo con VID/PID y la línea de estado, y se maximiza en ese monitor;
   intercalar teclas del teclado grande no interrumpe la secuencia del numpad.
9. Teclear en el numpad durante "Verificando…" no agrega dígitos ni provoca un segundo envío.
10. Abrir el exe por segunda vez trae al frente la ventana existente, también si estaba oculta en la bandeja.
11. "Abrir configuración" lleva a `/config` y, tras guardar, vuelve al kiosco.
12. El exe publicado, copiado solo a una carpeta limpia, arranca.
