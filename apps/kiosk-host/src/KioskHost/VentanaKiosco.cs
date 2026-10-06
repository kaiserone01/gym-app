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

        // OnLoad es async void: una excepción aquí cerraría la app sin explicación.
        try
        {
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
        catch (Exception error)
        {
            MessageBox.Show(
                $"No se pudo iniciar el navegador del kiosco:\n\n{error.Message}\n\nCierra el kiosco desde la bandeja (Salir) y vuelve a abrirlo. Si se repite, reinstala el runtime de WebView2.",
                "Kiosco", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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
