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

    // Teclas que solo existen en un numpad: dígitos, punto/Supr sin E0 y el Enter con E0. Retroceso y el Enter
    // sin E0 también están en el teclado principal, así que no se pueden reservar sin romperlo.
    public static bool EsExclusivaDelNumpad(ushort makeCode, bool e0) =>
        e0 ? makeCode == 0x1C : makeCode == 0x53 || Digitos.ContainsKey(makeCode);

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
