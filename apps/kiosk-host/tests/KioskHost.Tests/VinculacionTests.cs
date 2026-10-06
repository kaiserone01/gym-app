namespace KioskHost.Tests;

public class VinculacionTests
{
    private const string Clase = "{884b96c3-56ef-11d1-bc8c-00a0c91e6bf6}";

    private static string Ruta(string hardware, string instancia) => $@"\\?\HID#{hardware}#{instancia}#{Clase}";

    private static readonly string NumpadPuerto1 = Ruta("VID_1A2B&PID_3C4D", "7&11111111&0&0000");
    private static readonly string NumpadPuerto2 = Ruta("VID_1A2B&PID_3C4D", "7&22222222&0&0000");
    private static readonly string TecladoGrande = Ruta("VID_046D&PID_C31C&MI_00", "7&33333333&0&0000");
    private const string TecladoPs2 = @"\\?\ACPI#PNP0303#4&1d401fb5&0#{884b96c3-56ef-11d1-bc8c-00a0c91e6bf6}";

    [Fact]
    public void ExtraerVidPid_lee_vid_y_pid_en_mayusculas()
    {
        Assert.Equal(("1A2B", "3C4D"), Vinculacion.ExtraerVidPid(Ruta("vid_1a2b&pid_3c4d", "7&1&0&0000"))!.Value);
    }

    [Fact]
    public void ExtraerVidPid_sin_vid_devuelve_null()
    {
        Assert.Null(Vinculacion.ExtraerVidPid(TecladoPs2));
    }

    [Fact]
    public void Crear_guarda_ruta_vid_y_pid()
    {
        Assert.Equal(new DispositivoVinculado(NumpadPuerto1, "1A2B", "3C4D"), Vinculacion.Crear(NumpadPuerto1));
        Assert.Equal(new DispositivoVinculado(TecladoPs2, null, null), Vinculacion.Crear(TecladoPs2));
    }

    [Fact]
    public void Ruta_exacta_sin_distinguir_mayusculas()
    {
        var vinculado = Vinculacion.Crear(NumpadPuerto1);
        Assert.True(Vinculacion.EsVinculado(vinculado, NumpadPuerto1.ToLowerInvariant(), [NumpadPuerto1, TecladoGrande]));
    }

    [Fact]
    public void Cambio_de_puerto_con_un_unico_candidato_se_acepta()
    {
        var vinculado = Vinculacion.Crear(NumpadPuerto1);
        Assert.True(Vinculacion.EsVinculado(vinculado, NumpadPuerto2, [NumpadPuerto2, TecladoGrande]));
    }

    [Fact]
    public void Dos_numpads_iguales_en_puertos_nuevos_no_se_acepta_ninguno()
    {
        var vinculado = Vinculacion.Crear(Ruta("VID_1A2B&PID_3C4D", "7&99999999&0&0000"));
        string[] conectados = [NumpadPuerto1, NumpadPuerto2, TecladoGrande];
        Assert.False(Vinculacion.EsVinculado(vinculado, NumpadPuerto1, conectados));
        Assert.False(Vinculacion.EsVinculado(vinculado, NumpadPuerto2, conectados));
    }

    [Fact]
    public void Otro_dispositivo_no_es_el_vinculado()
    {
        var vinculado = Vinculacion.Crear(NumpadPuerto1);
        Assert.False(Vinculacion.EsVinculado(vinculado, TecladoGrande, [NumpadPuerto1, TecladoGrande]));
    }

    // Un mismo numpad puede exponer varias colecciones de teclado: no se cuentan como "dos numpads"
    // ni se confunden entre sí.
    [Fact]
    public void Misma_vid_pid_en_otra_coleccion_no_es_el_vinculado()
    {
        var coleccion1 = Ruta("VID_1A2B&PID_3C4D&MI_01&Col01", "8&aaaa&0&0000");
        var coleccion2 = Ruta("VID_1A2B&PID_3C4D&MI_01&Col02", "8&aaaa&0&0001");
        var vinculado = Vinculacion.Crear(coleccion1);
        Assert.False(Vinculacion.EsVinculado(vinculado, coleccion2, [coleccion1, coleccion2]));
        var coleccion1OtroPuerto = Ruta("VID_1A2B&PID_3C4D&MI_01&Col01", "8&bbbb&0&0000");
        Assert.True(Vinculacion.EsVinculado(vinculado, coleccion1OtroPuerto, [coleccion1OtroPuerto, coleccion2]));
    }

    [Fact]
    public void Sin_vid_solo_vale_la_ruta_exacta()
    {
        var vinculado = Vinculacion.Crear(TecladoPs2);
        var otroPs2 = @"\\?\ACPI#PNP0303#4&99999999&0#{884b96c3-56ef-11d1-bc8c-00a0c91e6bf6}";
        Assert.True(Vinculacion.EsVinculado(vinculado, TecladoPs2, [TecladoPs2]));
        Assert.False(Vinculacion.EsVinculado(vinculado, otroPs2, [otroPs2]));
    }
}

public class SecuenciaVinculacionTests
{
    private const nint A = 1;
    private const nint B = 2;
    private static readonly TeclaKiosco Enter = new(TipoTecla.Enter);

    private static TeclaKiosco D(char digito) => new(TipoTecla.Digito, digito);

    private static bool Teclear(SecuenciaVinculacion secuencia, nint dispositivo, params TeclaKiosco[] teclas)
    {
        var completa = false;
        foreach (var tecla in teclas) completa = secuencia.Registrar(dispositivo, tecla);
        return completa;
    }

    [Fact]
    public void Completa_solo_con_el_Enter_final()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.False(secuencia.Registrar(A, D('1')));
        Assert.False(secuencia.Registrar(A, D('2')));
        Assert.False(secuencia.Registrar(A, D('3')));
        Assert.True(secuencia.Registrar(A, Enter));
    }

    [Fact]
    public void Teclas_de_otro_dispositivo_intercaladas_no_rompen_la_secuencia()
    {
        var secuencia = new SecuenciaVinculacion();
        secuencia.Registrar(A, D('1'));
        secuencia.Registrar(B, D('9'));
        secuencia.Registrar(A, D('2'));
        Assert.False(secuencia.Registrar(B, Enter));
        secuencia.Registrar(A, D('3'));
        Assert.True(secuencia.Registrar(A, Enter));
    }

    [Fact]
    public void Tecla_equivocada_reinicia()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.False(Teclear(secuencia, A, D('1'), D('2'), D('9'), D('3'), Enter));
        Assert.True(Teclear(secuencia, A, D('1'), D('2'), D('3'), Enter));
    }

    [Fact]
    public void Retroceso_reinicia()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.False(Teclear(secuencia, A, D('1'), D('2'), new TeclaKiosco(TipoTecla.Retroceso), D('3'), Enter));
    }

    [Fact]
    public void Un_uno_repetido_cuenta_como_inicio_nuevo()
    {
        var secuencia = new SecuenciaVinculacion();
        Assert.True(Teclear(secuencia, A, D('1'), D('1'), D('2'), D('3'), Enter));
    }

    [Fact]
    public void Gana_el_primero_que_termina_y_se_olvida_el_avance_del_resto()
    {
        var secuencia = new SecuenciaVinculacion();
        Teclear(secuencia, A, D('1'), D('2'), D('3'));
        Assert.True(Teclear(secuencia, B, D('1'), D('2'), D('3'), Enter));
        Assert.False(secuencia.Registrar(A, Enter));
    }
}
