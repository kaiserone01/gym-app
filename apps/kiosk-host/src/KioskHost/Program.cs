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
