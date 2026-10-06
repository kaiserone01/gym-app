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
            // Un "dispositivo" editado a mano sin ruta no sirve para vincular: equivale a no tener numpad.
            if (string.IsNullOrWhiteSpace(config.Dispositivo?.Ruta)) config.Dispositivo = null;
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
