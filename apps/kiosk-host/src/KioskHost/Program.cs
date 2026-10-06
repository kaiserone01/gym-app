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
                $"{rutaConfig} no se pudo leer o no es un JSON válido. Se usan los valores por defecto y no se guardarán cambios hasta que lo corrijas o lo borres.",
                "Kiosco", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        var url = config.UrlEfectiva(Environment.GetEnvironmentVariable("KIOSK_URL"));
        using var ventana = new VentanaKiosco(config, rutaConfig, url);
        using var bandeja = new Bandeja(ventana);
        var espera = ThreadPool.RegisterWaitForSingleObject(
            mostrar,
            (_, _) =>
            {
                // Corre en un hilo del pool: si la ventana se destruye al cerrar, BeginInvoke lanza y mataría el proceso.
                try
                {
                    if (ventana.IsHandleCreated && !ventana.IsDisposed) ventana.BeginInvoke(new Action(ventana.Mostrar));
                }
                catch (Exception error) when (error is InvalidOperationException or ObjectDisposedException) { }
            },
            null, Timeout.Infinite, executeOnlyOnce: false);

        Application.Run(ventana);
        espera.Unregister(null);
    }
}
