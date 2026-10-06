namespace KioskHost.Tests;

public class MapeoTeclasTests
{
    [Theory]
    [InlineData(0x52, '0')]
    [InlineData(0x4F, '1')]
    [InlineData(0x50, '2')]
    [InlineData(0x51, '3')]
    [InlineData(0x4B, '4')]
    [InlineData(0x4C, '5')]
    [InlineData(0x4D, '6')]
    [InlineData(0x47, '7')]
    [InlineData(0x48, '8')]
    [InlineData(0x49, '9')]
    public void Digitos_del_numpad_sin_E0(int makeCode, char digito)
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Digito, digito), MapeoTeclas.Traducir((ushort)makeCode, e0: false));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Enter_con_y_sin_E0(bool e0)
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Enter), MapeoTeclas.Traducir(0x1C, e0));
    }

    [Fact]
    public void Flecha_izquierda_del_K601_es_retroceso()
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Retroceso), MapeoTeclas.Traducir(0x0E, e0: false));
    }

    [Fact]
    public void Punto_Del_sin_E0_limpia()
    {
        Assert.Equal(new TeclaKiosco(TipoTecla.Limpiar), MapeoTeclas.Traducir(0x53, e0: false));
    }

    // Con E0 son las flechas/Inicio/Supr dedicadas de un teclado completo, no el numpad.
    [Theory]
    [InlineData(0x47)]
    [InlineData(0x48)]
    [InlineData(0x49)]
    [InlineData(0x4B)]
    [InlineData(0x4D)]
    [InlineData(0x4F)]
    [InlineData(0x50)]
    [InlineData(0x51)]
    [InlineData(0x52)]
    [InlineData(0x53)]
    [InlineData(0x0E)]
    public void Teclas_de_navegacion_con_E0_se_ignoran(int makeCode)
    {
        Assert.Null(MapeoTeclas.Traducir((ushort)makeCode, e0: true));
    }

    // space, *, -, +, Tab, Num Lock, la letra A, y '/' del numpad (E0 0x35).
    [Theory]
    [InlineData(0x39, false)]
    [InlineData(0x37, false)]
    [InlineData(0x4A, false)]
    [InlineData(0x4E, false)]
    [InlineData(0x0F, false)]
    [InlineData(0x45, false)]
    [InlineData(0x1E, false)]
    [InlineData(0x35, true)]
    public void Teclas_no_mapeadas_se_ignoran(int makeCode, bool e0)
    {
        Assert.Null(MapeoTeclas.Traducir((ushort)makeCode, e0));
    }

    [Fact]
    public void Json_exacto_de_cada_mensaje()
    {
        Assert.Equal("{\"type\":\"digit\",\"value\":\"7\"}", new TeclaKiosco(TipoTecla.Digito, '7').AJson());
        Assert.Equal("{\"type\":\"enter\"}", new TeclaKiosco(TipoTecla.Enter).AJson());
        Assert.Equal("{\"type\":\"backspace\"}", new TeclaKiosco(TipoTecla.Retroceso).AJson());
        Assert.Equal("{\"type\":\"clear\"}", new TeclaKiosco(TipoTecla.Limpiar).AJson());
    }
}

public class FiltroRepeticionTests
{
    private const nint Numpad = 1;
    private const nint Teclado = 2;

    [Fact]
    public void Mantener_pulsada_solo_cuenta_la_primera_pulsacion()
    {
        var filtro = new FiltroRepeticion();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.False(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.False(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.False(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: true));
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
    }

    [Fact]
    public void Cada_dispositivo_lleva_sus_propias_teclas()
    {
        var filtro = new FiltroRepeticion();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
        Assert.True(filtro.EsPulsacionNueva(Teclado, 0x4F, false, soltar: false));
    }

    [Fact]
    public void Con_y_sin_E0_son_teclas_distintas()
    {
        var filtro = new FiltroRepeticion();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x1C, false, soltar: false));
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x1C, true, soltar: false));
    }

    // Una tecla que quedó "pulsada" al desconectar el numpad no debe bloquear su siguiente pulsación.
    [Fact]
    public void Limpiar_olvida_las_teclas_pulsadas()
    {
        var filtro = new FiltroRepeticion();
        filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false);
        filtro.Limpiar();
        Assert.True(filtro.EsPulsacionNueva(Numpad, 0x4F, false, soltar: false));
    }
}
