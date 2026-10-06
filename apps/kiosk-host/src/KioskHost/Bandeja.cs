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

        icono = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath!) ?? SystemIcons.Application, Text = "Kiosco", ContextMenuStrip = menu, Visible = true };
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

    private void CambiarInicioConWindows(bool activar)
    {
        try
        {
            using var clave = Registry.CurrentUser.CreateSubKey(ClaveInicio);
            if (activar) clave.SetValue(NombreInicio, $"\"{Environment.ProcessPath}\"");
            else clave.DeleteValue(NombreInicio, throwOnMissingValue: false);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            iniciarConWindows.Checked = IniciaConWindows();
            icono.ShowBalloonTip(8000, "Kiosco", $"No se pudo cambiar el inicio con Windows: {error.Message}", ToolTipIcon.Warning);
        }
    }

    public void Dispose()
    {
        icono.Visible = false;
        icono.Dispose();
    }
}
