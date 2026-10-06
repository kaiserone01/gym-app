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
