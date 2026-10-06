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
