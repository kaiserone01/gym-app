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

    [Theory]
    [InlineData("""{ "dispositivo": { "ruta": null, "vid": "1A2B", "pid": "3C4D" } }""")]
    [InlineData("""{ "dispositivo": { "ruta": "  ", "vid": "1A2B", "pid": "3C4D" } }""")]
    [InlineData("""{ "dispositivo": { "vid": "1A2B", "pid": "3C4D" } }""")]
    public void Dispositivo_sin_ruta_se_trata_como_sin_vincular(string json)
    {
        File.WriteAllText(Ruta, json);
        Assert.Null(ConfigHost.Cargar(Ruta).Dispositivo);
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
