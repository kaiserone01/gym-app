# Host de escritorio Windows para el kiosco — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** Un host nativo `apps/kiosk-host` (WinForms + WebView2) que muestra el kiosco desplegado y le reenvía, por mensajes de WebView2, solo las teclas del teclado numérico vinculado (RAIKU K-601), sin importar el foco de Windows.

**Arquitectura:** Raw Input pasivo (`RIDEV_INPUTSINK`) registrado sobre la ventana del host → filtro por dispositivo vinculado y autorepetición → mapeo por scan code → `CoreWebView2.PostWebMessageAsJson`. En `apps/kiosk`, un hook `useEntradaCedula` toma la cédula de esos mensajes (dentro del host) o del `<input>` de siempre (navegador normal / dev). La lógica pura del host (mapeo, filtro, vinculación, config) se prueba con xUnit; la parte Win32/UI se verifica compilando y con el checklist manual.

**Stack:** .NET 8 (`net8.0-windows`), WinForms, `Microsoft.Web.WebView2`, xUnit; Next 16 / React 19 en `apps/kiosk`.

**Spec:** `docs/superpowers/specs/2026-10-06-kiosk-host-windows-design.md`

## Restricciones globales
- Sin drivers de filtrado de input (tipo Interception) y sin permisos de administrador, ni para instalar ni para ejecutar.
- `RegisterRawInputDevices` con `RIDEV_INPUTSINK | RIDEV_DEVNOTIFY` y **sin** `RIDEV_NOLEGACY` (pasivo).
- Mapeo por **scan code** (`MakeCode` + flag E0), nunca por VKey ni carácter.
- Mensajes exactos: `{"type":"digit","value":"7"}`, `{"type":"enter"}`, `{"type":"backspace"}`, `{"type":"clear"}`. Nada de `ExecuteScriptAsync` para escribir en el DOM ni de simular teclas.
- URL efectiva: `KIOSK_URL` > `url` de `kiosk-host.json` > `https://kiosco.zipnegocios.com/`.
- `kiosk-host.json` junto al exe (`AppContext.BaseDirectory`); datos de WebView2 en `%LOCALAPPDATA%\KioskHost\WebView2`.
- No tocar `registrarCheckIn`, `colaPendientes`, `reintentarPendientes`, `public/sw.js`, `/config` ni `AccessCard`.
- Sin tests nuevos en `apps/kiosk`.
- CLAUDE.md: reutilizar antes de crear, cero redundancia, código mínimo. Commits **en español, una sola línea, sin cuerpo, sin `Co-Authored-By` ni firmas**; commit + `git push origin main` al cerrar cada tarea. `handoff.md` actualizado al cerrar la sesión.
- **dotnet en PowerShell:** el `C:\Program Files\dotnet\dotnet.exe` de la máquina no tiene SDK y va antes en el PATH. Anteponer a **cada** comando dotnet: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH";` (en los pasos se abrevia como `<dotnet>` = ese prefijo + `dotnet`).
- Todo texto visible al usuario, en español.

## Refinamientos sobre la spec (revisar al aprobar el plan)
1. **Vinculación por "id de hardware"** (2º tramo de la ruta, p. ej. `VID_1A2B&PID_3C4D&MI_00&Col01`) en vez de solo VID/PID. Ese tramo no depende del puerto USB, y además evita contar dos veces un mismo numpad que expone varias colecciones de teclado (si se contara por VID/PID, un solo K-601 podría parecer "dos candidatos" y nunca se recuperaría al cambiar de puerto). VID/PID se siguen guardando para mostrarlos.
2. **Bloqueo durante el envío en el hook:** en vez de una prop `ocupado` (que se actualiza tras el render y deja una carrera si llegan dos Enter seguidos), el hook ignora los mensajes nativos mientras la promesa de `alEnviar` (la función async `enviar` de `page.tsx`) esté pendiente. Es el mismo efecto que "mientras esté procesando", sin carrera.
3. `MapeoTeclas.Traducir(makeCode, e0)` no recibe `soltar`: el "soltar" y la autorepetición los descarta `FiltroRepeticion`, que vive en el mismo archivo.
4. `ConfigHost.Guardar` devuelve `bool`; si falla (archivo corrupto en solo lectura o carpeta sin permiso de escritura) el host muestra un aviso en vez de caerse.

## Foco de revisión
1. **Mantener pulsada una tecla del numpad** (autorepetición de Windows) → debe escribir un solo dígito. Test en Tarea 2 (`FiltroRepeticion`).
2. **`kiosk-host.json` editado a mano** con campos faltantes, `null` o tamaño de ventana 0 → arranca con valores por defecto, no se cae. Tests en Tarea 4.
3. **El monitor donde quedó la ventana ya no está conectado** → la ventana aparece en el monitor principal. Tests en Tarea 4 (`UbicacionVentana.Ajustar`).
4. **El exe está en una carpeta sin permiso de escritura** → no se cae al vincular ni al mover la ventana; avisa. Test en Tarea 4 (`Guardar` devuelve `false`) + aviso en Tarea 5.
5. **Un numpad que expone varias colecciones HID, o un teclado grande del mismo fabricante** → no se confunden con el numpad vinculado. Test en Tarea 3 (colecciones `Col01`/`Col02`).

---

## Estructura de archivos

```
.gitignore                                    (modificar: ignorar bin/ y obj/ de kiosk-host)
apps/kiosk-host/
  KioskHost.sln
  README.md                                   (Tarea 8)
  src/KioskHost/
    KioskHost.csproj
    Program.cs                                (Tareas 1, 5, 6)
    MapeoTeclas.cs                            (Tarea 2) TipoTecla, TeclaKiosco, MapeoTeclas, FiltroRepeticion
    Vinculacion.cs                            (Tarea 3) DispositivoVinculado, Vinculacion, SecuenciaVinculacion
    ConfigHost.cs                             (Tarea 4) ConfigHost, UbicacionVentana
    RawInput.cs                               (Tarea 5) P/Invoke user32
    VentanaKiosco.cs                          (Tarea 5) Form + WebView2 + WndProc
    Bandeja.cs                                (Tarea 6) NotifyIcon
  tests/KioskHost.Tests/
    KioskHost.Tests.csproj
    MapeoTeclasTests.cs                       (Tarea 2)
    VinculacionTests.cs                       (Tarea 3)
    ConfigHostTests.cs                        (Tarea 4)
apps/kiosk/
  lib/useEntradaCedula.ts                     (Tarea 7, nuevo)
  app/page.tsx                                (Tarea 7, modificar)
handoff.md                                    (Tarea 8)
```

---

### Tarea 1: SDK de .NET 8 y andamiaje de `apps/kiosk-host`

**Archivos:**
- Crear: `apps/kiosk-host/src/KioskHost/KioskHost.csproj`, `apps/kiosk-host/src/KioskHost/Program.cs`, `apps/kiosk-host/tests/KioskHost.Tests/KioskHost.Tests.csproj`, `apps/kiosk-host/KioskHost.sln`
- Modificar: `.gitignore`

**Interfaces:**
- Produce: proyecto `KioskHost` (WinExe, namespace `KioskHost`, internals visibles para `KioskHost.Tests`) y proyecto de tests `KioskHost.Tests` (namespace `KioskHost.Tests`, `using Xunit` global).

- [ ] **Paso 1: Instalar el SDK de .NET 8 por usuario (sin admin)**

```powershell
Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile "$env:TEMP\dotnet-install.ps1"
& "$env:TEMP\dotnet-install.ps1" -Channel 8.0 -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet"
```

Esperado: termina con `Installed version is 8.0.x` y sin pedir elevación. (No se usa `winget install Microsoft.DotNet.SDK.8`: ese instalador es MSI de máquina y pide admin.)

- [ ] **Paso 2: Verificar el SDK**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet --list-sdks`
Esperado: una línea `8.0.xxx [C:\Users\...\AppData\Local\Microsoft\dotnet\sdk]`.

- [ ] **Paso 3: Crear `apps/kiosk-host/src/KioskHost/KioskHost.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <ApplicationHighDpiMode>PerMonitorV2</ApplicationHighDpiMode>
    <RootNamespace>KioskHost</RootNamespace>
    <AssemblyName>KioskHost</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="KioskHost.Tests" />
  </ItemGroup>

</Project>
```

- [ ] **Paso 4: Crear `apps/kiosk-host/src/KioskHost/Program.cs` mínimo (se completa en la Tarea 5)**

```csharp
namespace KioskHost;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
    }
}
```

- [ ] **Paso 5: Crear `apps/kiosk-host/tests/KioskHost.Tests/KioskHost.Tests.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\KioskHost\KioskHost.csproj" />
  </ItemGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

</Project>
```

- [ ] **Paso 6: Crear la solución y agregar los proyectos**

```powershell
$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"
dotnet new sln -n KioskHost -o apps/kiosk-host
dotnet sln apps/kiosk-host/KioskHost.sln add apps/kiosk-host/src/KioskHost/KioskHost.csproj apps/kiosk-host/tests/KioskHost.Tests/KioskHost.Tests.csproj
```

Esperado: `Project ... added to the solution.` dos veces.

- [ ] **Paso 7: Ignorar `bin/` y `obj/` — agregar al final de `.gitignore`**

```
# apps/kiosk-host (.NET)
apps/kiosk-host/**/bin/
apps/kiosk-host/**/obj/
```

- [ ] **Paso 8: Compilar**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet build apps/kiosk-host/KioskHost.sln`
Esperado: `Compilación correcta` / `Build succeeded`, 0 errores.

- [ ] **Paso 9: Verificar que git no ve `bin/` ni `obj/`**

Run: `git status --short`
Esperado: aparecen `.gitignore` y los 4 archivos nuevos de `apps/kiosk-host`; ninguna ruta con `bin/` u `obj/`.

- [ ] **Paso 10: Commit y push**

```bash
git add .gitignore apps/kiosk-host
git commit -m "chore(kiosk-host): andamiaje del host Windows con proyecto de tests"
git push origin main
```

---

### Tarea 2: Mapeo de teclas por scan code y filtro de autorepetición

**Archivos:**
- Crear: `apps/kiosk-host/src/KioskHost/MapeoTeclas.cs`
- Test: `apps/kiosk-host/tests/KioskHost.Tests/MapeoTeclasTests.cs`

**Interfaces:**
- Produce:
  - `internal enum TipoTecla { Digito, Enter, Retroceso, Limpiar }`
  - `internal readonly record struct TeclaKiosco(TipoTecla Tipo, char Digito = '\0')` con `string AJson()`
  - `internal static class MapeoTeclas { static TeclaKiosco? Traducir(ushort makeCode, bool e0) }`
  - `internal sealed class FiltroRepeticion { bool EsPulsacionNueva(nint dispositivo, ushort makeCode, bool e0, bool soltar); void Limpiar(); }`

- [ ] **Paso 1: Escribir los tests que fallan — `MapeoTeclasTests.cs`**

```csharp
namespace KioskHost.Tests;

public class MapeoTeclasTests
{
    [Theory]
    [InlineData(0x52, '0')]
    [InlineData(0x4F, '1')]
    [InlineData(0x50, '2')]
    [InlineData(0x51, '3')]
    [InlineData(0x4B, '4')]
    [InlineData(0x4C, '5')]
    [InlineData(0x4D, '6')]
    [InlineData(0x47, '7')]
    [InlineData(0x48, '8')]
    [InlineData(0x49, '9')]
    public void Digitos_del_numpad_sin_E0(int makeCode, char digito)
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Digito, digito), MapeoTeclas.Traducir((ushort)makeCode, e0: false));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Enter_con_y_sin_E0(bool e0)
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Enter), MapeoTeclas.Traducir(0x1C, e0));
    }

    [Fact]
    public void Flecha_izquierda_del_K601_es_retroceso()
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Retroceso), MapeoTeclas.Traducir(0x0E, e0: false));
    }

    [Fact]
    public void Punto_Del_sin_E0_limpia()
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Limpiar), MapeoTeclas.Traducir(0x53, e0: false));
    }

    // Con E0 son las flechas/Inicio/Supr dedicadas de un teclado completo, no el numpad.
    [Theory]
    [InlineData(0x47)]
    [InlineData(0x48)]
    [InlineData(0x49)]
    [InlineData(0x4B)]
    [InlineData(0x4D)]
    [InlineData(0x4F)]
    [InlineData(0x50)]
    [InlineData(0x51)]
    [InlineData(0x52)]
    [InlineData(0x53)]
    [InlineData(0x0E)]
    public void Teclas_de_navegacion_con_E0_se_ignoran(int makeCode)
    {
        Assert.Null(MapeoTeclas.Traducir((ushort)makeCode, e0: true));
    }

    // space, *, -, +, Tab, Num Lock, la letra A, y '/' del numpad (E0 0x35).
    [Theory]
    [InlineData(0x39, false)]
    [InlineData(0x37, false)]
    [InlineData(0x4A, false)]
    [InlineData(0x4E, false)]
    [InlineData(0x0F, false)]
    [InlineData(0x45, false)]
    [InlineData(0x1E, false)]
    [InlineData(0x35, true)]
    public void Teclas_no_mapeadas_se_ignoran(int makeCode, bool e0)
    {
        Assert.Null(MapeoTeclas.Traducir((ushort)makeCode, e0));
    }

    [Fact]
    public void Json_exacto_de_cada_mensaje()
    {
        Assert.Equal("{\"type\":\"digit\",\"value\":\"7\"}", new TeclaKiosco(TipoTecla.Digito, '7').AJson());
        Assert.Equal("{\"type\":\"enter\"}", new TeclaKiosco(TipoTecla.Enter).AJson());
        Assert.Equal("{\"type\":\"backspace\"}", new TeclaKiosco(TipoTecla.Retroceso).AJson());
        Assert.Equal("{\"type\":\"clear\"}", new TeclaKiosco(TipoTecla.Limpiar).AJson());
    }
}

public class FiltroRepeticionTests
{
    private const nint Numpad = 1;
    private const nint Teclado = 2;

    [Fact]
    public void Mantener_pulsada_solo_cuenta_la_primera_pulsacion()
    {
        var filtro = new FiltroRepeticion();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.False(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.False(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.False(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: true));
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
    }

    [Fact]
    public void Cada_dispositivo_lleva_sus_propias_teclas()
    {
        var filtro = new FiltroRepeticion();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.True(filtro.EsPulsacionNueva(Teclado, 0x4F, false, soltar: false));
    }

    [Fact]
    public void Con_y_sin_E0_son_teclas_distintas()
    {
        var filtro = new FiltroRepeticion();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x1C, false, soltar: false));
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x1C, true, soltar: false));
    }

    // Una tecla que quedó "pulsada" al desconectar el numpad no debe bloquear su siguiente pulsación.
    [Fact]
    public void Limpiar_olvida_las_teclas_pulsadas()
    {
        var filtro = new FiltroRepeticion();
        filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false);
        filtro.Limpiar();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
    }
}
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: FALLA la compilación con `CS0246`/`CS0103` (no existen `TeclaKiosco`, `MapeoTeclas`, `FiltroRepeticion`).

- [ ] **Paso 3: Implementar `MapeoTeclas.cs`**

```csharp
namespace KioskHost;

internal enum TipoTecla { Digito, Enter, Retroceso, Limpiar }

internal readonly record struct TeclaKiosco(TipoTecla Tipo, char Digito = '\0')
{
    // Mensaje que recibe useEntradaCedula (apps/kiosk) vía PostWebMessageAsJson.
    public string AJson() => Tipo switch
    {
        TipoTecla.Digito => $"{{\"type\":\"digit\",\"value\":\"{Digito}\"}}",
        TipoTecla.Enter => "{\"type\":\"enter\"}",
        TipoTecla.Retroceso => "{\"type\":\"backspace\"}",
        TipoTecla.Limpiar => "{\"type\":\"clear\"}",
        _ => throw new ArgumentOutOfRangeException(nameof(Tipo)),
    };
}

// Traduce por scan code (MakeCode + E0), no por VKey: el numpad da el mismo scan code con NumLock
// encendido o apagado (7/Inicio, ./Supr), solo cambia la tecla virtual que Windows le asigna.
internal static class MapeoTeclas
{
    private static readonly Dictionary<ushort, char> Digitos = new()
    {
        [0x52] = '0', [0x4F] = '1', [0x50] = '2', [0x51] = '3', [0x4B] = '4',
        [0x4C] = '5', [0x4D] = '6', [0x47] = '7', [0x48] = '8', [0x49] = '9',
    };

    public static TeclaKiosco? Traducir(ushort makeCode, bool e0)
    {
        // Enter con o sin E0: algunos numpads baratos envían el Enter principal.
        if (makeCode == 0x1C) return new TeclaKiosco(TipoTecla.Enter);
        // Con E0 son las teclas de navegación dedicadas de un teclado completo.
        if (e0) return null;
        if (Digitos.TryGetValue(makeCode, out var digito)) return new TeclaKiosco(TipoTecla.Digito, digito);
        if (makeCode == 0x0E) return new TeclaKiosco(TipoTecla.Retroceso);
        if (makeCode == 0x53) return new TeclaKiosco(TipoTecla.Limpiar);
        return null;
    }
}

// Deja pasar solo el primer "pulsar" de cada tecla hasta su "soltar": descarta el "soltar" y la
// autorepetición de Windows al mantener una tecla pulsada.
internal sealed class FiltroRepeticion
{
    private readonly HashSet<(nint Dispositivo, ushort MakeCode, bool E0)> pulsadas = new();

    public bool EsPulsacionNueva(nint dispositivo, ushort makeCode, bool e0, bool soltar)
    {
        var tecla = (dispositivo, makeCode, e0);
        if (soltar)
        {
            pulsadas.Remove(tecla);
            return false;
        }
        return pulsadas.Add(tecla);
    }

    public void Limpiar() => pulsadas.Clear();
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: `Correctas: 38` / `Passed: 38`, 0 fallidas.

- [ ] **Paso 5: Commit y push**

```bash
git add apps/kiosk-host/src/KioskHost/MapeoTeclas.cs apps/kiosk-host/tests/KioskHost.Tests/MapeoTeclasTests.cs
git commit -m "feat(kiosk-host): mapeo de teclas del numpad por scan code y filtro de autorepeticion"
git push origin main
```

---

### Tarea 3: Vinculación del numpad y secuencia 1, 2, 3, Enter

**Archivos:**
- Crear: `apps/kiosk-host/src/KioskHost/Vinculacion.cs`
- Test: `apps/kiosk-host/tests/KioskHost.Tests/VinculacionTests.cs`

**Interfaces:**
- Consume: `TeclaKiosco`, `TipoTecla` (Tarea 2).
- Produce:
  - `internal sealed record DispositivoVinculado(string Ruta, string? Vid, string? Pid)`
  - `internal static class Vinculacion { static (string Vid, string Pid)? ExtraerVidPid(string ruta); static DispositivoVinculado Crear(string ruta); static bool EsVinculado(DispositivoVinculado vinculado, string ruta, IReadOnlyCollection<string> conectados); }`
  - `internal sealed class SecuenciaVinculacion { bool Registrar(nint dispositivo, TeclaKiosco tecla); void Reiniciar(); }`

- [ ] **Paso 1: Escribir los tests que fallan — `VinculacionTests.cs`**

```csharp
namespace KioskHost.Tests;

public class VinculacionTests
{
    private const string Clase = "{884b96c3-56ef-11d1-bc8c-00a0c91e6bf6}";

    private static string Ruta(string hardware, string instancia) => $@"\\?\HID#{hardware}#{instancia}#{Clase}";

    private static readonly string NumpadPuerto1 = Ruta("VID_1A2B&PID_3C4D", "7&11111111&0&0000");
    private static readonly string NumpadPuerto2 = Ruta("VID_1A2B&PID_3C4D", "7&22222222&0&0000");
    private static readonly string TecladoGrande = Ruta("VID_046D&PID_C31C&MI_00", "7&33333333&0&0000");
    private const string TecladoPs2 = @"\\?\ACPI#PNP0303#4&1d401fb5&0#{884b96c3-56ef-11d1-bc8c-00a0c91e6bf6}";

    [Fact]
    public void ExtraerVidPid_lee_vid_y_pid_en_mayusculas()
    {
        Assert.Equal(("1A2B", "3C4D"), Vinculacion.ExtraerVidPid(Ruta("vid_1a2b&pid_3c4d", "7&1&0&0000"))!.Value);
    }

    [Fact]
    public void ExtraerVidPid_sin_vid_devuelve_null()
    {
        Assert.Null(Vinculacion.ExtraerVidPid(TecladoPs2));
    }

    [Fact]
    public void Crear_guarda_ruta_vid_y_pid()
    {
        Assert.Equal(new DispositivoVinculado(NumpadPuerto1, "1A2B", "3C4D"), Vinculacion.Crear(NumpadPuerto1));
        Assert.Equal(new DispositivoVinculado(TecladoPs2, null, null), Vinculacion.Crear(TecladoPs2));
    }

    [Fact]
    public void Ruta_exacta_sin_distinguir_mayusculas()
    {
        var vinculado = Vinculacion.Crear(NumpadPuerto1);
        Assert.True(Vinculacion.EsVinculado(vinculado, NumpadPuerto1.ToLowerInvariant(), [NumpadPuerto1, TecladoGrande]));
    }

    [Fact]
    public void Cambio_de_puerto_con_un_unico_candidato_se_acepta()
    {
        var vinculado = Vinculacion.Crear(NumpadPuerto1);
        Assert.True(Vinculacion.EsVinculado(vinculado, NumpadPuerto2, [NumpadPuerto2, TecladoGrande]));
    }

    [Fact]
    public void Dos_numpads_iguales_en_puertos_nuevos_no_se_acepta_ninguno()
    {
        var vinculado = Vinculacion.Crear(Ruta("VID_1A2B&PID_3C4D", "7&99999999&0&0000"));
        string[] conectados = [NumpadPuerto1, NumpadPuerto2, TecladoGrande];
        Assert.False(Vinculacion.EsVinculado(vinculado, NumpadPuerto1, conectados));
        Assert.False(Vinculacion.EsVinculado(vinculado, NumpadPuerto2, conectados));
    }

    [Fact]
    public void Otro_dispositivo_no_es_el_vinculado()
    {
        var vinculado = Vinculacion.Crear(NumpadPuerto1);
        Assert.False(Vinculacion.EsVinculado(vinculado, TecladoGrande, [NumpadPuerto1, TecladoGrande]));
    }

    // Un mismo numpad puede exponer varias colecciones de teclado: no se cuentan como "dos numpads"
    // ni se confunden entre sí.
    [Fact]
    public void Misma_vid_pid_en_otra_coleccion_no_es_el_vinculado()
    {
        var coleccion1 = Ruta("VID_1A2B&PID_3C4D&MI_01&Col01", "8&aaaa&0&0000");
        var coleccion2 = Ruta("VID_1A2B&PID_3C4D&MI_01&Col02", "8&aaaa&0&0001");
        var vinculado = Vinculacion.Crear(coleccion1);
        Assert.False(Vinculacion.EsVinculado(vinculado, coleccion2, [coleccion1, coleccion2]));
        var coleccion1OtroPuerto = Ruta("VID_1A2B&PID_3C4D&MI_01&Col01", "8&bbbb&0&0000");
        Assert.True(Vinculacion.EsVinculado(vinculado, coleccion1OtroPuerto, [coleccion1OtroPuerto, coleccion2]));
    }

    [Fact]
    public void Sin_vid_solo_vale_la_ruta_exacta()
    {
        var vinculado = Vinculacion.Crear(TecladoPs2);
        var otroPs2 = @"\\?\ACPI#PNP0303#4&99999999&0#{884b96c3-56ef-11d1-bc8c-00a0c91e6bf6}";
        Assert.True(Vinculacion.EsVinculado(vinculado, TecladoPs2, [TecladoPs2]));
        Assert.False(Vinculacion.EsVinculado(vinculado, otroPs2, [otroPs2]));
    }
}

public class SecuenciaVinculacionTests
{
    private const nint A = 1;
    private const nint B = 2;
    private static readonly TeclaKiosco Enter = new(TipoTecla.Enter);

    private static TeclaKiosco D(char digito) => new(TipoTecla.Digito, digito);

    private static bool Teclear(SecuenciaVinculacion secuencia, nint dispositivo, params TeclaKiosco[] teclas)
    {
        var completa = false;
        foreach (var tecla in teclas) completa = secuencia.Registrar(dispositivo, tecla);
        return completa;
    }

    [Fact]
    public void Completa_solo_con_el_Enter_final()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.False(secuencia.Registrar(A, D('1')));
        Assert.False(secuencia.Registrar(A, D('2')));
        Assert.False(secuencia.Registrar(A, D('3')));
        Assert.True(secuencia.Registrar(A, Enter));
    }

    [Fact]
    public void Teclas_de_otro_dispositivo_intercaladas_no_rompen_la_secuencia()
    {
        var secuencia = new SecuenciaVinculacion();
        secuencia.Registrar(A, D('1'));
        secuencia.Registrar(B, D('9'));
        secuencia.Registrar(A, D('2'));
        Assert.False(secuencia.Registrar(B, Enter));
        secuencia.Registrar(A, D('3'));
        Assert.True(secuencia.Registrar(A, Enter));
    }

    [Fact]
    public void Tecla_equivocada_reinicia()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.False(Teclear(secuencia, A, D('1'), D('2'), D('9'), D('3'), Enter));
        Assert.True(Teclear(secuencia, A, D('1'), D('2'), D('3'), Enter));
    }

    [Fact]
    public void Retroceso_reinicia()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.False(Teclear(secuencia, A, D('1'), D('2'), new TeclaKiosco(TipoTecla.Retroceso), D('3'), Enter));
    }

    [Fact]
    public void Un_uno_repetido_cuenta_como_inicio_nuevo()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.True(Teclear(secuencia, A, D('1'), D('1'), D('2'), D('3'), Enter));
    }

    [Fact]
    public void Gana_el_primero_que_termina_y_se_olvida_el_avance_del_resto()
    {
        var secuencia = new SecuenciaVinculacion();
        Teclear(secuencia, A, D('1'), D('2'), D('3'));
        Assert.True(Teclear(secuencia, B, D('1'), D('2'), D('3'), Enter));
        Assert.False(secuencia.Registrar(A, Enter));
    }
}
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: FALLA la compilación (`CS0246`: no existen `Vinculacion`, `DispositivoVinculado`, `SecuenciaVinculacion`).

- [ ] **Paso 3: Implementar `Vinculacion.cs`**

```csharp
using System.Text.RegularExpressions;

namespace KioskHost;

// Lo que se guarda en kiosk-host.json. Vid/Pid son null en teclados sin VID (p. ej. PS/2).
internal sealed record DispositivoVinculado(string Ruta, string? Vid, string? Pid);

internal static class Vinculacion
{
    private static readonly Regex VidPid = new(@"VID_([0-9A-F]{4}).*?PID_([0-9A-F]{4})", RegexOptions.IgnoreCase);

    public static (string Vid, string Pid)? ExtraerVidPid(string ruta)
    {
        var coincidencia = VidPid.Match(ruta);
        if (!coincidencia.Success) return null;
        return (coincidencia.Groups[1].Value.ToUpperInvariant(), coincidencia.Groups[2].Value.ToUpperInvariant());
    }

    public static DispositivoVinculado Crear(string ruta)
    {
        var vidPid = ExtraerVidPid(ruta);
        return new DispositivoVinculado(ruta, vidPid?.Vid, vidPid?.Pid);
    }

    // Una ruta es `\\?\HID#<id de hardware>#<instancia>#<clase>`. El id de hardware
    // (`VID_xxxx&PID_yyyy&MI_00&Col01`) identifica modelo e interfaz; la instancia cambia con el puerto USB.
    private static string? IdHardware(string ruta)
    {
        var tramos = ruta.Split('#');
        return tramos.Length >= 3 ? tramos[1].ToUpperInvariant() : null;
    }

    // `conectados`: rutas de todos los teclados conectados ahora (incluida `ruta`).
    public static bool EsVinculado(DispositivoVinculado vinculado, string ruta, IReadOnlyCollection<string> conectados)
    {
        if (string.Equals(vinculado.Ruta, ruta, StringComparison.OrdinalIgnoreCase)) return true;
        if (vinculado.Vid is null) return false;
        // Cambio de puerto: se acepta solo si hay exactamente un teclado conectado de ese modelo e interfaz.
        var id = IdHardware(vinculado.Ruta);
        return id is not null && IdHardware(ruta) == id && conectados.Count(c => IdHardware(c) == id) == 1;
    }
}

// Modo aprender: vincula el primer dispositivo que teclee 1, 2, 3, Enter completo. El avance es
// independiente por dispositivo, así que teclear en otro teclado no interrumpe la secuencia del numpad.
internal sealed class SecuenciaVinculacion
{
    private static readonly TeclaKiosco[] Esperada =
    [
        new(TipoTecla.Digito, '1'), new(TipoTecla.Digito, '2'), new(TipoTecla.Digito, '3'), new(TipoTecla.Enter),
    ];

    private readonly Dictionary<nint, int> avance = new();

    public bool Registrar(nint dispositivo, TeclaKiosco tecla)
    {
        avance.TryGetValue(dispositivo, out var paso);
        if (tecla == Esperada[paso]) paso++;
        else paso = tecla == Esperada[0] ? 1 : 0;

        if (paso == Esperada.Length)
        {
            avance.Clear();
            return true;
        }
        avance[dispositivo] = paso;
        return false;
    }

    public void Reiniciar() => avance.Clear();
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: todas correctas (38 de la Tarea 2 + 15 nuevas = 53), 0 fallidas.

- [ ] **Paso 5: Commit y push**

```bash
git add apps/kiosk-host/src/KioskHost/Vinculacion.cs apps/kiosk-host/tests/KioskHost.Tests/VinculacionTests.cs
git commit -m "feat(kiosk-host): vinculacion del numpad por ruta o id de hardware y secuencia 1-2-3-Enter"
git push origin main
```

---

### Tarea 4: Configuración `kiosk-host.json`, URL efectiva y ubicación de la ventana

**Archivos:**
- Crear: `apps/kiosk-host/src/KioskHost/ConfigHost.cs`
- Test: `apps/kiosk-host/tests/KioskHost.Tests/ConfigHostTests.cs`

**Interfaces:**
- Consume: `DispositivoVinculado` (Tarea 3).
- Produce:
  - `internal sealed class UbicacionVentana { string Modo; int X, Y, Ancho, Alto; Rectangle Limites (JsonIgnore, get/set); static Rectangle Ajustar(Rectangle guardado, IReadOnlyCollection<Rectangle> areas, Rectangle principal); }`
  - `internal sealed class ConfigHost { const string UrlPorDefecto; string? Url; DispositivoVinculado? Dispositivo; UbicacionVentana Ventana; bool SoloLectura (JsonIgnore); static ConfigHost Cargar(string ruta); bool Guardar(string ruta); Uri UrlEfectiva(string? variableEntorno); static bool MismoOrigen(Uri a, Uri b); static Uri UrlConfiguracion(Uri url); }`

- [ ] **Paso 1: Escribir los tests que fallan — `ConfigHostTests.cs`**

```csharp
using System.Drawing;

namespace KioskHost.Tests;

public sealed class ConfigHostTests : IDisposable
{
    private readonly string carpeta = Directory.CreateTempSubdirectory("kiosk-host-tests").FullName;

    private string Ruta => Path.Combine(carpeta, "kiosk-host.json");

    public void Dispose() => Directory.Delete(carpeta, recursive: true);

    [Fact]
    public void Archivo_ausente_se_crea_con_valores_por_defecto()
    {
        var config = ConfigHost.Cargar(Ruta);
        Assert.True(File.Exists(Ruta));
        Assert.False(config.SoloLectura);
        Assert.Equal(ConfigHost.UrlPorDefecto, config.Url);
        Assert.Null(config.Dispositivo);
        Assert.Equal("completa", config.Ventana.Modo);
    }

    [Fact]
    public void Json_usa_los_nombres_del_spec()
    {
        ConfigHost.Cargar(Ruta);
        var json = File.ReadAllText(Ruta);
        Assert.Contains("\"url\"", json);
        Assert.Contains("\"dispositivo\"", json);
        Assert.Contains("\"ventana\"", json);
        Assert.Contains("\"modo\"", json);
        Assert.Contains("\"ancho\"", json);
    }

    [Fact]
    public void Ida_y_vuelta_de_dispositivo_y_ventana()
    {
        var config = ConfigHost.Cargar(Ruta);
        config.Dispositivo = new DispositivoVinculado(@"\\?\HID#VID_1A2B&PID_3C4D#7&1#{c}", "1A2B", "3C4D");
        config.Ventana = new UbicacionVentana { Modo = "ventana", X = 10, Y = 20, Ancho = 800, Alto = 600 };
        Assert.True(config.Guardar(Ruta));

        var leida = ConfigHost.Cargar(Ruta);
        Assert.Equal(config.Dispositivo, leida.Dispositivo);
        Assert.Equal(("ventana", 10, 20, 800, 600), (leida.Ventana.Modo, leida.Ventana.X, leida.Ventana.Y, leida.Ventana.Ancho, leida.Ventana.Alto));
    }

    [Fact]
    public void Json_invalido_usa_valores_por_defecto_y_no_lo_sobrescribe()
    {
        File.WriteAllText(Ruta, "{ esto no es json");
        var config = ConfigHost.Cargar(Ruta);
        Assert.True(config.SoloLectura);
        Assert.Equal(ConfigHost.UrlPorDefecto, config.Url);
        Assert.False(config.Guardar(Ruta));
        Assert.Equal("{ esto no es json", File.ReadAllText(Ruta));
    }

    [Fact]
    public void Campos_faltantes_o_nulos_toman_valores_por_defecto()
    {
        File.WriteAllText(Ruta, """{ "url": "https://otro.ejemplo/", "ventana": null }""");
        var config = ConfigHost.Cargar(Ruta);
        Assert.Equal("https://otro.ejemplo/", config.Url);
        Assert.Null(config.Dispositivo);
        Assert.Equal("completa", config.Ventana.Modo);
    }

    [Fact]
    public void Guardar_en_una_carpeta_inexistente_devuelve_false_sin_lanzar()
    {
        var config = new ConfigHost();
        Assert.False(config.Guardar(Path.Combine(carpeta, "no-existe", "kiosk-host.json")));
    }

    [Theory]
    [InlineData("https://env.ejemplo/", "https://json.ejemplo/", "https://env.ejemplo/")]
    [InlineData(null, "https://json.ejemplo/", "https://json.ejemplo/")]
    [InlineData("   ", "https://json.ejemplo/", "https://json.ejemplo/")]
    [InlineData("no es una url", "https://json.ejemplo/", "https://json.ejemplo/")]
    [InlineData(null, null, ConfigHost.UrlPorDefecto)]
    [InlineData(null, "C:\\kiosco\\index.html", ConfigHost.UrlPorDefecto)]
    [InlineData("http://localhost:3001/", null, "http://localhost:3001/")]
    public void UrlEfectiva_prioriza_KIOSK_URL_luego_url_luego_defecto(string? entorno, string? url, string esperada)
    {
        var config = new ConfigHost { Url = url };
        Assert.Equal(new Uri(esperada), config.UrlEfectiva(entorno));
    }

    [Theory]
    [InlineData("https://kiosco.zipnegocios.com/config", true)]
    [InlineData("https://KIOSCO.zipnegocios.com/", true)]
    [InlineData("http://kiosco.zipnegocios.com/", false)]
    [InlineData("https://kiosco.zipnegocios.com:8443/", false)]
    [InlineData("https://otro.com/", false)]
    public void MismoOrigen_compara_esquema_host_y_puerto(string destino, bool esperado)
    {
        Assert.Equal(esperado, ConfigHost.MismoOrigen(new Uri(destino), new Uri("https://kiosco.zipnegocios.com/")));
    }

    [Fact]
    public void UrlConfiguracion_apunta_a_config_del_mismo_origen()
    {
        Assert.Equal(new Uri("https://kiosco.zipnegocios.com/config"), ConfigHost.UrlConfiguracion(new Uri("https://kiosco.zipnegocios.com/algo/")));
    }
}

public class UbicacionVentanaTests
{
    private static readonly Rectangle Principal = new(0, 0, 1920, 1040);
    private static readonly Rectangle Segundo = new(1920, 0, 1280, 984);

    [Fact]
    public void Dentro_de_un_monitor_conectado_se_respeta()
    {
        var guardado = new Rectangle(2000, 100, 800, 600);
        Assert.Equal(guardado, UbicacionVentana.Ajustar(guardado, [Principal, Segundo], Principal));
    }

    [Fact]
    public void Fuera_de_todo_monitor_se_centra_en_el_principal()
    {
        Assert.Equal(new Rectangle(560, 220, 800, 600), UbicacionVentana.Ajustar(new Rectangle(5000, 100, 800, 600), [Principal], Principal));
    }

    [Fact]
    public void Mas_grande_que_el_principal_se_recorta()
    {
        Assert.Equal(Principal, UbicacionVentana.Ajustar(new Rectangle(5000, 0, 4000, 3000), [Principal], Principal));
    }

    [Fact]
    public void Tamano_invalido_usa_1024x768()
    {
        Assert.Equal(new Rectangle(100, 100, 1024, 768), UbicacionVentana.Ajustar(new Rectangle(100, 100, 0, 0), [Principal], Principal));
    }
}
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: FALLA la compilación (`CS0246`: no existen `ConfigHost`, `UbicacionVentana`).

- [ ] **Paso 3: Implementar `ConfigHost.cs`**

```csharp
using System.Drawing;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KioskHost;

internal sealed class UbicacionVentana
{
    public string Modo { get; set; } = "completa";
    public int X { get; set; } = 100;
    public int Y { get; set; } = 100;
    public int Ancho { get; set; } = 1024;
    public int Alto { get; set; } = 768;

    [JsonIgnore]
    public Rectangle Limites
    {
        get => new(X, Y, Ancho, Alto);
        set => (X, Y, Ancho, Alto) = (value.X, value.Y, value.Width, value.Height);
    }

    // Si los límites guardados no caen en ningún monitor conectado (p. ej. se desconectó el segundo
    // monitor), centra la ventana en el principal.
    public static Rectangle Ajustar(Rectangle guardado, IReadOnlyCollection<Rectangle> areas, Rectangle principal)
    {
        if (guardado.Width < 320 || guardado.Height < 240) guardado.Size = new Size(1024, 768);
        if (areas.Any(area => area.IntersectsWith(guardado))) return guardado;

        var ancho = Math.Min(guardado.Width, principal.Width);
        var alto = Math.Min(guardado.Height, principal.Height);
        return new Rectangle(principal.X + (principal.Width - ancho) / 2, principal.Y + (principal.Height - alto) / 2, ancho, alto);
    }
}

// kiosk-host.json, junto al exe.
internal sealed class ConfigHost
{
    public const string UrlPorDefecto = "https://kiosco.zipnegocios.com/";

    private static readonly JsonSerializerOptions Opciones = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    public string? Url { get; set; } = UrlPorDefecto;
    public DispositivoVinculado? Dispositivo { get; set; }
    public UbicacionVentana Ventana { get; set; } = new();

    // true si el archivo no era JSON válido: se usan los valores por defecto y no se sobrescribe,
    // para no perder lo que el usuario editó a mano.
    [JsonIgnore]
    public bool SoloLectura { get; private set; }

    public static ConfigHost Cargar(string ruta)
    {
        if (!File.Exists(ruta))
        {
            var nueva = new ConfigHost();
            nueva.Guardar(ruta);
            return nueva;
        }
        try
        {
            var config = JsonSerializer.Deserialize<ConfigHost>(File.ReadAllText(ruta), Opciones) ?? new ConfigHost();
            config.Ventana ??= new UbicacionVentana();
            return config;
        }
        catch (JsonException)
        {
            return new ConfigHost { SoloLectura = true };
        }
    }

    public bool Guardar(string ruta)
    {
        if (SoloLectura) return false;
        try
        {
            File.WriteAllText(ruta, JsonSerializer.Serialize(this, Opciones));
            return true;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    // KIOSK_URL > url del json > valor por defecto; solo URLs http(s) absolutas.
    public Uri UrlEfectiva(string? variableEntorno)
    {
        foreach (var candidata in new[] { variableEntorno, Url })
        {
            if (Uri.TryCreate(candidata?.Trim(), UriKind.Absolute, out var url) && (url.Scheme == Uri.UriSchemeHttps || url.Scheme == Uri.UriSchemeHttp))
                return url;
        }
        return new Uri(UrlPorDefecto);
    }

    public static bool MismoOrigen(Uri a, Uri b) =>
        a.Scheme == b.Scheme && string.Equals(a.Host, b.Host, StringComparison.OrdinalIgnoreCase) && a.Port == b.Port;

    // Pantalla de API key de apps/kiosk (el host no tiene barra de direcciones).
    public static Uri UrlConfiguracion(Uri url) => new(url, "/config");
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: todas correctas (53 + 23 = 76), 0 fallidas.

- [ ] **Paso 5: Commit y push**

```bash
git add apps/kiosk-host/src/KioskHost/ConfigHost.cs apps/kiosk-host/tests/KioskHost.Tests/ConfigHostTests.cs
git commit -m "feat(kiosk-host): configuracion kiosk-host.json con url por entorno y ubicacion de la ventana"
git push origin main
```

---

### Tarea 5: Raw Input, ventana con WebView2 y modo aprender

**Archivos:**
- Crear: `apps/kiosk-host/src/KioskHost/RawInput.cs`, `apps/kiosk-host/src/KioskHost/VentanaKiosco.cs`
- Modificar: `apps/kiosk-host/src/KioskHost/Program.cs` (reemplazo completo), `apps/kiosk-host/src/KioskHost/KioskHost.csproj` (paquete WebView2)

**Interfaces:**
- Consume: `MapeoTeclas.Traducir`, `FiltroRepeticion` (Tarea 2); `Vinculacion.Crear/EsVinculado`, `SecuenciaVinculacion` (Tarea 3); `ConfigHost`, `UbicacionVentana.Ajustar` (Tarea 4).
- Produce (para la Tarea 6):
  - `VentanaKiosco(ConfigHost config, string rutaConfig, Uri url)`
  - `event Action<string>? Aviso`, `event Action? EstadoCambiado`
  - `string Modo` (`"completa"` | `"ventana"`), `string EstadoVinculacion`
  - `void Mostrar()`, `void CambiarModo(string modo)`, `void Revincular()`, `void AbrirConfiguracion()`, `void Recargar()`, `void Salir()`

- [ ] **Paso 1: Agregar el paquete WebView2**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet add apps/kiosk-host/src/KioskHost/KioskHost.csproj package Microsoft.Web.WebView2`
Esperado: `PackageReference for package 'Microsoft.Web.WebView2' version '1.0.x' added`.

- [ ] **Paso 2: Crear `RawInput.cs`**

```csharp
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace KioskHost;

// P/Invoke de Raw Input (user32). Sin lógica: solo registrar, leer pulsaciones y nombrar dispositivos.
internal static class RawInput
{
    public const int WM_INPUT = 0x00FF;
    public const int WM_INPUT_DEVICE_CHANGE = 0x00FE;

    private const uint RIDEV_INPUTSINK = 0x00000100;
    private const uint RIDEV_DEVNOTIFY = 0x00002000;
    private const uint RID_INPUT = 0x10000003;
    private const uint RIM_TYPEKEYBOARD = 1;
    private const uint RIDI_DEVICENAME = 0x20000007;
    private const ushort RI_KEY_BREAK = 0x01;
    private const ushort RI_KEY_E0 = 0x02;

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public nint hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public nint hDevice;
        public nint wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWKEYBOARD
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICELIST
    {
        public nint hDevice;
        public uint dwType;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] dispositivos, uint cantidad, uint tamano);

    [DllImport("user32.dll")]
    private static extern uint GetRawInputData(nint hRawInput, uint comando, nint datos, ref uint tamano, uint tamanoCabecera);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetRawInputDeviceInfo(nint dispositivo, uint comando, nint datos, ref uint tamano);

    [DllImport("user32.dll")]
    private static extern uint GetRawInputDeviceList(nint lista, ref uint cantidad, uint tamano);

    public readonly record struct Pulsacion(nint Dispositivo, ushort MakeCode, bool E0, bool Soltar);

    // Pasivo: sin RIDEV_NOLEGACY, Windows y las demás apps siguen recibiendo todas las teclas.
    // RIDEV_INPUTSINK: llega aunque la ventana no tenga el foco.
    public static void Registrar(nint ventana)
    {
        RAWINPUTDEVICE[] dispositivos =
        [
            new() { usUsagePage = 0x01, usUsage = 0x06, dwFlags = RIDEV_INPUTSINK | RIDEV_DEVNOTIFY, hwndTarget = ventana },
        ];
        if (!RegisterRawInputDevices(dispositivos, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    public static Pulsacion? Leer(nint lParam)
    {
        var tamanoCabecera = (uint)Marshal.SizeOf<RAWINPUTHEADER>();
        uint tamano = 0;
        GetRawInputData(lParam, RID_INPUT, 0, ref tamano, tamanoCabecera);
        if (tamano == 0) return null;

        var buffer = Marshal.AllocHGlobal((int)tamano);
        try
        {
            if (GetRawInputData(lParam, RID_INPUT, buffer, ref tamano, tamanoCabecera) != tamano) return null;
            var cabecera = Marshal.PtrToStructure<RAWINPUTHEADER>(buffer);
            if (cabecera.dwType != RIM_TYPEKEYBOARD) return null;
            var teclado = Marshal.PtrToStructure<RAWKEYBOARD>(buffer + (int)tamanoCabecera);
            return new Pulsacion(cabecera.hDevice, teclado.MakeCode, (teclado.Flags & RI_KEY_E0) != 0, (teclado.Flags & RI_KEY_BREAK) != 0);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static string? NombreDispositivo(nint dispositivo)
    {
        uint caracteres = 0;
        GetRawInputDeviceInfo(dispositivo, RIDI_DEVICENAME, 0, ref caracteres);
        if (caracteres == 0) return null;

        var buffer = Marshal.AllocHGlobal((int)caracteres * sizeof(char));
        try
        {
            return GetRawInputDeviceInfo(dispositivo, RIDI_DEVICENAME, buffer, ref caracteres) == uint.MaxValue
                ? null
                : Marshal.PtrToStringUni(buffer);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static List<string> TecladosConectados()
    {
        var tamano = (uint)Marshal.SizeOf<RAWINPUTDEVICELIST>();
        uint cantidad = 0;
        GetRawInputDeviceList(0, ref cantidad, tamano);
        var rutas = new List<string>();
        if (cantidad == 0) return rutas;

        var buffer = Marshal.AllocHGlobal((int)(cantidad * tamano));
        try
        {
            var leidos = GetRawInputDeviceList(buffer, ref cantidad, tamano);
            if (leidos == uint.MaxValue) return rutas;
            for (var i = 0; i < leidos; i++)
            {
                var dispositivo = Marshal.PtrToStructure<RAWINPUTDEVICELIST>(buffer + i * (int)tamano);
                if (dispositivo.dwType == RIM_TYPEKEYBOARD && NombreDispositivo(dispositivo.hDevice) is { } ruta) rutas.Add(ruta);
            }
            return rutas;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }
}
```

- [ ] **Paso 3: Crear `VentanaKiosco.cs`**

```csharp
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KioskHost;

// Muestra apps/kiosk en WebView2 y le reenvía, como mensajes, solo las teclas del teclado numérico
// vinculado. Raw Input es pasivo: Windows y las demás apps siguen recibiendo todas las teclas.
internal sealed class VentanaKiosco : Form
{
    private const string MensajeAprender = "Para vincular el teclado numérico pulsa 1, 2, 3 y Enter en él";

    private readonly ConfigHost config;
    private readonly string rutaConfig;
    private readonly Uri url;
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };
    private readonly FiltroRepeticion filtro = new();
    private readonly SecuenciaVinculacion secuencia = new();
    private readonly Dictionary<nint, string?> nombres = new();
    private List<string>? conectados;
    private bool saliendo;

    public event Action<string>? Aviso;
    public event Action? EstadoCambiado;

    public VentanaKiosco(ConfigHost config, string rutaConfig, Uri url)
    {
        this.config = config;
        this.rutaConfig = rutaConfig;
        this.url = url;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        Controls.Add(webView);
        AplicarModo();
    }

    public string Modo => config.Ventana.Modo == "ventana" ? "ventana" : "completa";

    public string EstadoVinculacion => config.Dispositivo is { } dispositivo
        ? $"Estado: vinculado VID {dispositivo.Vid ?? "?"} PID {dispositivo.Pid ?? "?"}"
        : "Estado: sin vincular";

    private bool Aprendiendo => config.Dispositivo is null;

    public void Mostrar()
    {
        Show();
        AplicarModo();
        Activate();
    }

    public void CambiarModo(string modo)
    {
        GuardarLimites();
        config.Ventana.Modo = modo;
        config.Guardar(rutaConfig);
        AplicarModo();
        EstadoCambiado?.Invoke();
    }

    public void Revincular()
    {
        config.Dispositivo = null;
        secuencia.Reiniciar();
        Mostrar();
        EstadoCambiado?.Invoke();
        Aviso?.Invoke(MensajeAprender);
    }

    public void AbrirConfiguracion() => webView.CoreWebView2?.Navigate(ConfigHost.UrlConfiguracion(url).ToString());

    public void Recargar() => webView.CoreWebView2?.Reload();

    public void Salir()
    {
        saliendo = true;
        GuardarLimites();
        config.Guardar(rutaConfig);
        Close();
    }

    // Pantalla completa: sin bordes, maximizada y fija. Modo ventana (configuración, o mientras no hay
    // numpad vinculado, para que se vea el título): con bordes, redimensionable y movible. Ambos TopMost.
    private void AplicarModo()
    {
        var limites = UbicacionVentana.Ajustar(
            config.Ventana.Limites,
            Screen.AllScreens.Select(pantalla => pantalla.WorkingArea).ToList(),
            Screen.PrimaryScreen!.WorkingArea);

        // Primero el estilo con bordes, para que OnResize no fuerce el maximizado mientras se reubica.
        FormBorderStyle = FormBorderStyle.Sizable;
        WindowState = FormWindowState.Normal;
        Bounds = limites;
        Text = Aprendiendo ? $"Kiosco — {MensajeAprender}" : "Kiosco";

        if (Modo == "completa" && !Aprendiendo)
        {
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
        }
    }

    private void GuardarLimites()
    {
        if (Visible && FormBorderStyle == FormBorderStyle.Sizable && WindowState == FormWindowState.Normal)
            config.Ventana.Limites = Bounds;
    }

    // En pantalla completa nada la restaura ni la minimiza (p. ej. Win+Abajo).
    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (FormBorderStyle == FormBorderStyle.None && WindowState != FormWindowState.Maximized)
            WindowState = FormWindowState.Maximized;
    }

    protected override void OnResizeEnd(EventArgs e)
    {
        base.OnResizeEnd(e);
        GuardarLimites();
        config.Guardar(rutaConfig);
    }

    // La X y Alt+F4 la ocultan a la bandeja; solo "Salir" cierra la app.
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!saliendo && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnFormClosing(e);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        RawInput.Registrar(Handle);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        AvisarEstadoInicial();

        var datos = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KioskHost", "WebView2");
        var entorno = await CoreWebView2Environment.CreateAsync(userDataFolder: datos);
        await webView.EnsureCoreWebView2Async(entorno);

        var ajustes = webView.CoreWebView2.Settings;
        ajustes.AreDefaultContextMenusEnabled = false;
        ajustes.AreDevToolsEnabled = false;
        ajustes.IsZoomControlEnabled = false;
        ajustes.IsPinchZoomEnabled = false;
        ajustes.IsStatusBarEnabled = false;
        ajustes.AreBrowserAcceleratorKeysEnabled = false;

        webView.CoreWebView2.NewWindowRequested += (_, evento) => evento.Handled = true;
        webView.CoreWebView2.NavigationStarting += (_, evento) =>
        {
            if (!Uri.TryCreate(evento.Uri, UriKind.Absolute, out var destino) || !ConfigHost.MismoOrigen(destino, url))
                evento.Cancel = true;
        };
        webView.CoreWebView2.Navigate(url.ToString());
    }

    private void AvisarEstadoInicial()
    {
        if (config.Dispositivo is not { } vinculado)
        {
            Aviso?.Invoke(MensajeAprender);
            return;
        }
        var teclados = RawInput.TecladosConectados();
        if (!teclados.Any(ruta => Vinculacion.EsVinculado(vinculado, ruta, teclados)))
            Aviso?.Invoke("No se encuentra el teclado numérico vinculado (desconectado, o hay varios iguales). Conéctalo o usa \"Re-vincular teclado numérico\" en la bandeja.");
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == RawInput.WM_INPUT && RawInput.Leer(m.LParam) is { } pulsacion)
        {
            Procesar(pulsacion);
        }
        else if (m.Msg == RawInput.WM_INPUT_DEVICE_CHANGE)
        {
            filtro.Limpiar();
            nombres.Clear();
            conectados = null;
        }
        base.WndProc(ref m);
    }

    private void Procesar(RawInput.Pulsacion pulsacion)
    {
        if (!filtro.EsPulsacionNueva(pulsacion.Dispositivo, pulsacion.MakeCode, pulsacion.E0, pulsacion.Soltar)) return;
        if (MapeoTeclas.Traducir(pulsacion.MakeCode, pulsacion.E0) is not { } tecla) return;
        if (Nombre(pulsacion.Dispositivo) is not { } ruta) return;

        if (config.Dispositivo is not { } vinculado)
        {
            if (secuencia.Registrar(pulsacion.Dispositivo, tecla)) Vincular(ruta);
            return;
        }

        if (!Vinculacion.EsVinculado(vinculado, ruta, conectados ??= RawInput.TecladosConectados())) return;
        if (!string.Equals(vinculado.Ruta, ruta, StringComparison.OrdinalIgnoreCase))
        {
            // Lo cambiaron de puerto USB: se recuerda la ruta nueva.
            config.Dispositivo = vinculado with { Ruta = ruta };
            config.Guardar(rutaConfig);
        }
        webView.CoreWebView2?.PostWebMessageAsJson(tecla.AJson());
    }

    private void Vincular(string ruta)
    {
        var dispositivo = Vinculacion.Crear(ruta);
        config.Dispositivo = dispositivo;
        var guardado = config.Guardar(rutaConfig);
        AplicarModo();
        EstadoCambiado?.Invoke();
        Aviso?.Invoke(guardado
            ? $"Teclado numérico vinculado (VID {dispositivo.Vid ?? "?"}, PID {dispositivo.Pid ?? "?"})"
            : "Teclado numérico vinculado solo hasta cerrar el kiosco: no se pudo guardar kiosk-host.json (revisa que la carpeta del exe permita escribir y que el archivo sea JSON válido).");
    }

    private string? Nombre(nint dispositivo)
    {
        if (!nombres.TryGetValue(dispositivo, out var nombre))
            nombres[dispositivo] = nombre = RawInput.NombreDispositivo(dispositivo);
        return nombre;
    }
}
```

- [ ] **Paso 4: Reemplazar `Program.cs`**

```csharp
using Microsoft.Web.WebView2.Core;

namespace KioskHost;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        try
        {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "Falta el runtime de Microsoft Edge WebView2.\n\nInstálalo desde https://go.microsoft.com/fwlink/p/?LinkId=2124703 y vuelve a abrir el kiosco.",
                "Kiosco", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var rutaConfig = Path.Combine(AppContext.BaseDirectory, "kiosk-host.json");
        var config = ConfigHost.Cargar(rutaConfig);
        if (config.SoloLectura)
        {
            MessageBox.Show(
                $"{rutaConfig} no es un JSON válido. Se usan los valores por defecto y no se guardarán cambios hasta que lo corrijas o lo borres.",
                "Kiosco", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        var url = config.UrlEfectiva(Environment.GetEnvironmentVariable("KIOSK_URL"));
        using var ventana = new VentanaKiosco(config, rutaConfig, url);
        Application.Run(ventana);
    }
}
```

- [ ] **Paso 5: Compilar y correr los tests**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet build apps/kiosk-host/KioskHost.sln; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: compilación sin errores ni advertencias de nulabilidad nuevas; 76 tests correctos.

- [ ] **Paso 6: Prueba de humo (arranca y carga WebView2)**

```powershell
$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"
$proceso = Start-Process -FilePath "apps/kiosk-host/src/KioskHost/bin/Debug/net8.0-windows/KioskHost.exe" -PassThru
Start-Sleep -Seconds 10
"KioskHost vivo: $(-not $proceso.HasExited)"
"Procesos WebView2: $((Get-Process msedgewebview2 -ErrorAction SilentlyContinue).Count)"
Get-Content "apps/kiosk-host/src/KioskHost/bin/Debug/net8.0-windows/kiosk-host.json"
Stop-Process -Id $proceso.Id
```

Esperado: `KioskHost vivo: True`, al menos 1 proceso `msedgewebview2`, y un `kiosk-host.json` con `"dispositivo": null` y `"modo": "completa"`. (La ventana aparece en modo ventana con el título del modo aprender, porque no hay numpad vinculado; la validación con el K-601 es del checklist de la Tarea 8.)

- [ ] **Paso 7: Commit y push**

```bash
git add apps/kiosk-host/src/KioskHost
git commit -m "feat(kiosk-host): ventana WebView2 con Raw Input pasivo y modo aprender del numpad"
git push origin main
```

---

### Tarea 6: Bandeja del sistema, instancia única e inicio con Windows

**Archivos:**
- Crear: `apps/kiosk-host/src/KioskHost/Bandeja.cs`
- Modificar: `apps/kiosk-host/src/KioskHost/Program.cs` (reemplazo completo)

**Interfaces:**
- Consume: todo lo público de `VentanaKiosco` (Tarea 5).
- Produce: `internal sealed class Bandeja : IDisposable { Bandeja(VentanaKiosco ventana); }`

- [ ] **Paso 1: Crear `Bandeja.cs`**

```csharp
using Microsoft.Win32;

namespace KioskHost;

internal sealed class Bandeja : IDisposable
{
    private const string ClaveInicio = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string NombreInicio = "KioskHost";

    private readonly VentanaKiosco ventana;
    private readonly NotifyIcon icono;
    private readonly ToolStripMenuItem estado = new() { Enabled = false };
    private readonly ToolStripMenuItem pantallaCompleta = new("Pantalla completa");
    private readonly ToolStripMenuItem modoVentana = new("Modo ventana (configuración)");
    private readonly ToolStripMenuItem iniciarConWindows = new("Iniciar con Windows") { CheckOnClick = true };

    public Bandeja(VentanaKiosco ventana)
    {
        this.ventana = ventana;

        pantallaCompleta.Click += (_, _) => ventana.CambiarModo("completa");
        modoVentana.Click += (_, _) => ventana.CambiarModo("ventana");
        iniciarConWindows.Checked = IniciaConWindows();
        iniciarConWindows.Click += (_, _) => CambiarInicioConWindows(iniciarConWindows.Checked);

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[]
        {
            estado,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Mostrar kiosco", null, (_, _) => ventana.Mostrar()),
            pantallaCompleta,
            modoVentana,
            new ToolStripMenuItem("Re-vincular teclado numérico", null, (_, _) => ventana.Revincular()),
            new ToolStripMenuItem("Abrir configuración", null, (_, _) => ventana.AbrirConfiguracion()),
            new ToolStripMenuItem("Recargar página", null, (_, _) => ventana.Recargar()),
            iniciarConWindows,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Salir", null, (_, _) => ventana.Salir()),
        });
        menu.Opening += (_, _) => Actualizar();

        icono = new NotifyIcon { Icon = SystemIcons.Application, Text = "Kiosco", ContextMenuStrip = menu, Visible = true };
        icono.DoubleClick += (_, _) => ventana.Mostrar();

        ventana.Aviso += texto => icono.ShowBalloonTip(8000, "Kiosco", texto, ToolTipIcon.Info);
        ventana.EstadoCambiado += Actualizar;
        Actualizar();
    }

    private void Actualizar()
    {
        estado.Text = ventana.EstadoVinculacion;
        pantallaCompleta.Checked = ventana.Modo == "completa";
        modoVentana.Checked = ventana.Modo == "ventana";
    }

    // HKCU: no requiere permisos de administrador.
    private static bool IniciaConWindows()
    {
        using var clave = Registry.CurrentUser.OpenSubKey(ClaveInicio);
        return clave?.GetValue(NombreInicio) is string;
    }

    private static void CambiarInicioConWindows(bool activar)
    {
        using var clave = Registry.CurrentUser.CreateSubKey(ClaveInicio);
        if (activar) clave.SetValue(NombreInicio, $"\"{Environment.ProcessPath}\"");
        else clave.DeleteValue(NombreInicio, throwOnMissingValue: false);
    }

    public void Dispose()
    {
        icono.Visible = false;
        icono.Dispose();
    }
}
```

- [ ] **Paso 2: Reemplazar `Program.cs` (instancia única + bandeja)**

```csharp
using Microsoft.Web.WebView2.Core;

namespace KioskHost;

internal static class Program
{
    private const string NombreInstancia = @"Local\KioskHost.Instancia";
    private const string NombreMostrar = @"Local\KioskHost.Mostrar";

    [STAThread]
    private static void Main()
    {
        using var instancia = new Mutex(initiallyOwned: true, NombreInstancia, out var esPrimera);
        using var mostrar = new EventWaitHandle(false, EventResetMode.AutoReset, NombreMostrar);
        if (!esPrimera)
        {
            // Ya hay un kiosco abierto: que se muestre (aunque esté oculto en la bandeja) y salir.
            mostrar.Set();
            return;
        }

        ApplicationConfiguration.Initialize();

        try
        {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "Falta el runtime de Microsoft Edge WebView2.\n\nInstálalo desde https://go.microsoft.com/fwlink/p/?LinkId=2124703 y vuelve a abrir el kiosco.",
                "Kiosco", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var rutaConfig = Path.Combine(AppContext.BaseDirectory, "kiosk-host.json");
        var config = ConfigHost.Cargar(rutaConfig);
        if (config.SoloLectura)
        {
            MessageBox.Show(
                $"{rutaConfig} no es un JSON válido. Se usan los valores por defecto y no se guardarán cambios hasta que lo corrijas o lo borres.",
                "Kiosco", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        var url = config.UrlEfectiva(Environment.GetEnvironmentVariable("KIOSK_URL"));
        using var ventana = new VentanaKiosco(config, rutaConfig, url);
        using var bandeja = new Bandeja(ventana);
        var espera = ThreadPool.RegisterWaitForSingleObject(
            mostrar, (_, _) => ventana.BeginInvoke(new Action(ventana.Mostrar)), null, Timeout.Infinite, executeOnlyOnce: false);

        Application.Run(ventana);
        espera.Unregister(null);
    }
}
```

- [ ] **Paso 3: Compilar y correr los tests**

Run: `$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"; dotnet build apps/kiosk-host/KioskHost.sln; dotnet test apps/kiosk-host/KioskHost.sln`
Esperado: compilación sin errores; 76 tests correctos.

- [ ] **Paso 4: Prueba de humo de instancia única**

```powershell
$exe = "apps/kiosk-host/src/KioskHost/bin/Debug/net8.0-windows/KioskHost.exe"
$primera = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 5
$segunda = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 3
"Primera viva: $(-not $primera.HasExited) / Segunda terminó: $($segunda.HasExited)"
Stop-Process -Id $primera.Id
```

Esperado: `Primera viva: True / Segunda terminó: True`.

- [ ] **Paso 5: Commit y push**

```bash
git add apps/kiosk-host/src/KioskHost/Bandeja.cs apps/kiosk-host/src/KioskHost/Program.cs
git commit -m "feat(kiosk-host): bandeja con estado de vinculacion, instancia unica e inicio con Windows"
git push origin main
```

---

### Tarea 7: `useEntradaCedula` en `apps/kiosk`

**Archivos:**
- Crear: `apps/kiosk/lib/useEntradaCedula.ts`
- Modificar: `apps/kiosk/app/page.tsx` (imports, estado de la cédula, `enviar`, el efecto de foco de las líneas 56-61 y el `<input>` de las líneas 112-132)

**Interfaces:**
- Consume: los mensajes JSON de `TeclaKiosco.AJson()` (Tarea 2).
- Produce: `useEntradaCedula({ alEscribir: () => void, alEnviar: (cedula: string) => Promise<void> }) → { cedula: string; limpiar: () => void; nativo: boolean; propsInput }`

- [ ] **Paso 1: Crear `apps/kiosk/lib/useEntradaCedula.ts`**

```ts
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from "react";

// Mensajes de apps/kiosk-host (teclado numérico vinculado, vía CoreWebView2.PostWebMessageAsJson).
type MensajeTeclado =
  | { type: "digit"; value: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "clear" };

type EscuchaMensaje = (evento: { data: unknown }) => void;

interface WebView2 {
  addEventListener(tipo: "message", escucha: EscuchaMensaje): void;
  removeEventListener(tipo: "message", escucha: EscuchaMensaje): void;
}

function obtenerWebView(): WebView2 | undefined {
  return (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;
}

const sinSuscripcion = () => () => {};
const hayHostNativo = () => obtenerWebView() !== undefined;
const sinHostEnServidor = () => false;

interface Opciones {
  // Cada vez que se escribe o borra (page.tsx limpia la ficha del check-in anterior).
  alEscribir: () => void;
  alEnviar: (cedula: string) => Promise<void>;
}

// Fuente de la cédula: dentro de apps/kiosk-host llega por mensajes nativos, sin depender del foco de
// Windows; en un navegador normal (dev) se usa el <input> con eventos DOM de siempre.
export function useEntradaCedula({ alEscribir, alEnviar }: Opciones) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cedula, setCedula] = useState("");
  // Espejo síncrono: "dígito + Enter" seguidos deben ver el valor actual sin esperar al render.
  const cedulaRef = useRef("");
  const opciones = useRef({ alEscribir, alEnviar });
  const nativo = useSyncExternalStore(sinSuscripcion, hayHostNativo, sinHostEnServidor);

  useEffect(() => {
    opciones.current = { alEscribir, alEnviar };
  });

  const asignar = useCallback((valor: string) => {
    cedulaRef.current = valor;
    setCedula(valor);
  }, []);

  useEffect(() => {
    const webview = obtenerWebView();
    if (!nativo || !webview) return;

    // Mientras se envía una cédula se ignora todo: evita el doble envío y dígitos que se perderían.
    let enviando = false;
    const alRecibir: EscuchaMensaje = ({ data }) => {
      if (enviando || typeof data !== "object" || data === null) return;
      const mensaje = data as MensajeTeclado;
      const { alEscribir, alEnviar } = opciones.current;

      switch (mensaje.type) {
        case "digit":
          if (!/^\d$/.test(mensaje.value)) return;
          alEscribir();
          asignar(cedulaRef.current + mensaje.value);
          return;
        case "backspace":
          alEscribir();
          asignar(cedulaRef.current.slice(0, -1));
          return;
        case "clear":
          alEscribir();
          asignar("");
          return;
        case "enter":
          enviando = true;
          alEnviar(cedulaRef.current).finally(() => {
            enviando = false;
          });
      }
    };

    webview.addEventListener("message", alRecibir);
    return () => webview.removeEventListener("message", alRecibir);
  }, [nativo, asignar]);

  // Sin host, el kiosco tiene un teclado numérico físico y no pantalla táctil (ADR v1 §2.5): el input
  // siempre debe estar enfocado para capturarlo sin que el staff toque nada.
  useEffect(() => {
    if (!nativo) inputRef.current?.focus();
  });

  const propsInput = {
    ref: inputRef,
    value: cedula,
    onChange: (evento: ChangeEvent<HTMLInputElement>) => {
      opciones.current.alEscribir();
      asignar(evento.target.value.replace(/\D/g, ""));
    },
    onKeyDown: (evento: KeyboardEvent<HTMLInputElement>) => {
      if (evento.key === "Enter") void opciones.current.alEnviar(cedulaRef.current);
      if (evento.key === "Escape") asignar("");
    },
    onBlur: () => inputRef.current?.focus(),
    inputMode: "numeric" as const,
    autoFocus: true,
  };

  return { cedula, limpiar: () => asignar(""), nativo, propsInput };
}
```

- [ ] **Paso 2: `page.tsx` — imports**

Reemplazar:
```tsx
import { useCallback, useEffect, useRef, useState } from "react";
```
por:
```tsx
import { useCallback, useEffect, useState } from "react";
```

y debajo de `import { AccessCard } from "@/components/AccessCard";` agregar:
```tsx
import { useEntradaCedula } from "@/lib/useEntradaCedula";
```

- [ ] **Paso 3: `page.tsx` — estado de la cédula vía el hook**

Reemplazar:
```tsx
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "esperando" });
```
por:
```tsx
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "esperando" });
  const { cedula, limpiar, nativo, propsInput } = useEntradaCedula({
    // Escribir la siguiente cédula limpia la ficha del check-in anterior
    // sin esperar a que se oculte sola (ver DURACION_FICHA_MS).
    alEscribir: () => {
      if (estado.tipo !== "esperando" && estado.tipo !== "procesando") {
        setEstado({ tipo: "esperando" });
      }
    },
    alEnviar: enviar,
  });
```

- [ ] **Paso 4: `page.tsx` — quitar el efecto de foco (ahora vive en el hook, solo para el modo DOM)**

Eliminar:
```tsx
  // El kiosco tiene un teclado numérico físico, no pantalla táctil (ADR
  // v1 §2.5) — el input siempre debe estar enfocado para capturarlo sin
  // que el staff tenga que tocar nada.
  useEffect(() => {
    inputRef.current?.focus();
  });

```

- [ ] **Paso 5: `page.tsx` — `enviar` recibe la cédula**

Reemplazar `  async function enviar() {` por `  async function enviar(cedula: string) {`, y al final de esa función reemplazar `    setCedula("");` por `    limpiar();`.

- [ ] **Paso 6: `page.tsx` — el campo según la fuente**

Reemplazar el bloque `<input ref={inputRef} ... />` completo (desde `        <input` hasta su `/>`) por:
```tsx
        {nativo ? (
          // Dentro de apps/kiosk-host la cédula llega por mensajes nativos: no hace falta foco.
          <div
            className="w-full max-w-sm min-h-[3.25rem] text-center text-3xl tracking-widest border-b-2 py-2"
            style={{ borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }}
          >
            {cedula}
          </div>
        ) : (
          <input
            {...propsInput}
            className="w-full max-w-sm text-center text-3xl tracking-widest bg-transparent border-b-2 py-2 outline-none"
            style={{ borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }}
          />
        )}
```

- [ ] **Paso 7: Tipos y lint**

Run: `cd apps/kiosk; npx tsc --noEmit; npx eslint app/page.tsx lib/useEntradaCedula.ts`
Esperado: sin salida (0 errores, 0 advertencias).

- [ ] **Paso 8: Build estático (verifica que el hook no rompe el export / la hidratación)**

Run: `npm run build --workspace apps/kiosk`
Esperado: `✓ Compiled successfully` y exportación de `/` y `/config` sin errores.

- [ ] **Paso 9: Modo dev sin host (verificación manual del usuario)**

Run: `npm run dev` desde la raíz y abrir `http://localhost:3001/` en un navegador normal.
Esperado: el input sigue enfocado; teclear dígitos, Enter envía, Escape borra, clic afuera devuelve el foco — igual que antes del cambio.

- [ ] **Paso 10: Commit y push**

```bash
git add apps/kiosk/lib/useEntradaCedula.ts apps/kiosk/app/page.tsx
git commit -m "feat(kiosco): hook useEntradaCedula con mensajes del host nativo y respaldo DOM"
git push origin main
```

---

### Tarea 8: Publicación, README y handoff

**Archivos:**
- Crear: `apps/kiosk-host/README.md`
- Modificar: `handoff.md`

**Interfaces:**
- Consume: el exe de las Tareas 5-6.

- [ ] **Paso 1: Publicar el exe autocontenido**

```powershell
$env:PATH = "$env:LOCALAPPDATA\Microsoft\dotnet;$env:PATH"
dotnet publish apps/kiosk-host/src/KioskHost -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "$env:TEMP\kiosk-host-publicado"
Get-ChildItem "$env:TEMP\kiosk-host-publicado"
```

Esperado: `KioskHost.exe` (~70-80 MB) y `KioskHost.pdb`; anotar si aparece `WebView2Loader.dll` suelta.

- [ ] **Paso 2: Verificar el exe solo, en una carpeta limpia (comprueba `WebView2Loader.dll`)**

```powershell
$limpia = New-Item -ItemType Directory -Force "$env:TEMP\kiosk-host-limpio"
Copy-Item "$env:TEMP\kiosk-host-publicado\KioskHost.exe" $limpia
$proceso = Start-Process -FilePath "$limpia\KioskHost.exe" -PassThru
Start-Sleep -Seconds 10
"Vivo: $(-not $proceso.HasExited) / WebView2: $((Get-Process msedgewebview2 -ErrorAction SilentlyContinue).Count)"
Stop-Process -Id $proceso.Id -ErrorAction SilentlyContinue
```

Esperado: `Vivo: True` y al menos 1 proceso WebView2. **Si el proceso murió** (no encontró el loader): volver a publicar **sin** `-p:IncludeNativeLibrariesForSelfExtract=true`, repetir este paso copiando también `WebView2Loader.dll`, y en el README (Paso 3) dejar la variante "copiar `KioskHost.exe` y `WebView2Loader.dll`". Usar en el README el comando y la lista de archivos que efectivamente funcionaron.

- [ ] **Paso 3: Crear `apps/kiosk-host/README.md`**

````markdown
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

## Publicar e instalar en el PC del kiosco
```powershell
dotnet publish apps/kiosk-host/src/KioskHost -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publicado
```
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
2. En el teclado numérico, pulsar **1, 2, 3, Enter**. Se vincula el primer teclado que complete la
   secuencia: no la tecleen en el numpad del teclado grande.
3. Aparece el globo *"Teclado numérico vinculado (VID xxxx, PID yyyy)"*, la bandeja muestra
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
8. Vincular con 1, 2, 3, Enter muestra el globo con VID/PID y la línea de estado; intercalar teclas del
   teclado grande no interrumpe la secuencia del numpad. Sin vincular, arranca en modo ventana.
9. Teclear en el numpad durante "Verificando…" no agrega dígitos ni provoca un segundo envío.
10. Abrir el exe por segunda vez trae al frente la ventana existente, también si estaba oculta en la bandeja.
11. "Abrir configuración" lleva a `/config` y, tras guardar, vuelve al kiosco.
12. El exe publicado, copiado solo a una carpeta limpia, arranca.
````

- [ ] **Paso 4: Actualizar `handoff.md`** (respetando sus 5 secciones; en "Intentos fallidos" solo agregar, nunca borrar)
  - **Objetivo:** sumar una línea: host Windows `apps/kiosk-host` (WinForms + WebView2 + Raw Input) para que el numpad K-601 alimente solo al kiosco.
  - **Estado actual:** host implementado y con 76 tests en verde; hook `useEntradaCedula` en `apps/kiosk`; resultado real de la verificación de `WebView2Loader.dll` del Paso 2; **pendiente** el checklist manual del README con el K-601 y el deploy del kiosco (el cambio web solo tiene efecto dentro del host, en navegador es idéntico a antes).
  - **Archivos y cambios:** los de las Tareas 1-8.
  - **Intentos fallidos:** agregar: WebHID/WebUSB, Electron/Tauri sin código nativo y eventos DOM no distinguen teclados (estudio de factibilidad); `winget install Microsoft.DotNet.SDK.8` requiere admin → se usa `dotnet-install.ps1` por usuario; el `dotnet.exe` de `Program Files` no tiene SDK y va antes en el PATH; y, si ocurrió en el Paso 2, el fallo del single-file con `WebView2Loader.dll`.
  - **Próximos pasos:** 1) correr el checklist del README en el PC del kiosco con el K-601; 2) desplegar `apps/kiosk` con el hook; 3) instalar el exe en `%LOCALAPPDATA%\KioskHost\` con "Iniciar con Windows".

- [ ] **Paso 5: Commit y push**

```bash
git add apps/kiosk-host/README.md handoff.md
git commit -m "docs(kiosk-host): README de instalacion, vinculacion y checklist; handoff actualizado"
git push origin main
```
