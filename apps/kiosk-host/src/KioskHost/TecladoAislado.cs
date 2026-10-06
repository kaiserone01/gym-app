using System.Runtime.InteropServices;

namespace KioskHost;

// Reserva el teclado numérico para el kiosco: mientras haya un numpad vinculado, sus teclas exclusivas (ver
// MapeoTeclas.EsExclusivaDelNumpad) no llegan a ninguna otra ventana. Windows llama al hook antes de entregar
// el Raw Input y una tecla bloqueada nunca lo genera, así que no se puede saber de qué teclado viene: el
// bloqueo vale para el numpad de cualquier teclado y el propio hook entrega la tecla al kiosco.
internal sealed class TecladoAislado : IDisposable
{
    private const int WH_KEYBOARD_LL = 13;
    private const uint LLKHF_EXTENDED = 0x01;
    private const uint LLKHF_INJECTED = 0x10;
    private const uint LLKHF_UP = 0x80;

    private delegate nint ProcesoHook(int codigo, nint wParam, nint lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT
    {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public nint dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern nint SetWindowsHookEx(int tipo, ProcesoHook proceso, nint modulo, uint hilo);

    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(nint hook);

    [DllImport("user32.dll")]
    private static extern nint CallNextHookEx(nint hook, int codigo, nint wParam, nint lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern nint GetModuleHandle(string? modulo);

    private readonly Func<bool> activo;
    private readonly Action<TeclaKiosco> alPulsar;
    private readonly FiltroRepeticion filtro = new();
    private readonly ProcesoHook proceso; // referencia viva: si el GC lo recoge, Windows llamaría a memoria liberada
    private nint hook;

    public TecladoAislado(Func<bool> activo, Action<TeclaKiosco> alPulsar)
    {
        this.activo = activo;
        this.alPulsar = alPulsar;
        proceso = Procesar;
        hook = SetWindowsHookEx(WH_KEYBOARD_LL, proceso, GetModuleHandle(null), 0);
    }

    public bool Activo => hook != 0;

    private nint Procesar(int codigo, nint wParam, nint lParam)
    {
        if (codigo >= 0 && Reservar(Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam))) return 1;
        return CallNextHookEx(hook, codigo, wParam, lParam);
    }

    private bool Reservar(KBDLLHOOKSTRUCT tecla)
    {
        if ((tecla.flags & LLKHF_INJECTED) != 0 || !activo()) return false;
        var scanCode = (ushort)tecla.scanCode;
        var e0 = (tecla.flags & LLKHF_EXTENDED) != 0;
        if (!MapeoTeclas.EsExclusivaDelNumpad(scanCode, e0)) return false;

        // Dispositivo 0: el hook no conoce el teclado; el filtro solo descarta la autorepetición.
        if (filtro.EsPulsacionNueva(0, scanCode, e0, (tecla.flags & LLKHF_UP) != 0) && MapeoTeclas.Traducir(scanCode, e0) is { } traducida)
            alPulsar(traducida);
        return true;
    }

    public void Dispose()
    {
        if (hook == 0) return;
        UnhookWindowsHookEx(hook);
        hook = 0;
    }
}
