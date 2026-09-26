"use client";

import { useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import type { MetodoPago, TipoMetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { TIPOS_QUE_PUEDEN_SER_EN_BS } from "@gym-app/domain/entities/MetodoPago";
import { ETIQUETA_TIPO_METODO_PAGO, construirNombreMetodo } from "../configuraciones/metodosPagoUI";
import { formatearBs } from "../tasaBcvFija";
import { registrarTasaManualAction } from "../configuraciones/actions";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";

// Íconos SVG inline por tipo — sin depender de PNGs ni emojis (ver diseño
// acordado). EFECTIVO comparte un único ícono de billete para USD/Bs,
// diferenciado con un badge de moneda junto al ícono.
function IconoBillete() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 9v0M19 15v0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoTelefono() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <rect x="6" y="2" width="12" height="20" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 18h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoBanco() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <path d="M3 10l9-6 9 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9M10 10v9M14 10v9M19 10v9M3 19h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoTarjeta() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconoHuella() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <path
        d="M12 3a7 7 0 0 0-7 7c0 4 2 6 2 9M12 3a7 7 0 0 1 7 7c0 2-.3 3.5-.8 4.7M9 12a3 3 0 0 1 6 0c0 3-1 5-1 8M12 9a3 3 0 0 0-3 3c0 3.5-1 5.5-2 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconoCripto() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10h6a2 2 0 0 1 0 4H8m2-4v8m0-8V8m0 10v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Refresco perezoso (Etapa 2 del plan de tasa BCV): si el modal queda
// abierto más de 45 min (ETag → casi siempre 304), se vuelve a pedir la
// tasa y se actualiza el monto en Bs mostrado — evita cobrar con una tasa
// vencida en una operación larga.
const INTERVALO_REVALIDACION_MS = 45 * 60_000;

const ICONO_TIPO: Record<TipoMetodoPago, () => React.ReactElement> = {
  EFECTIVO: IconoBillete,
  PAGO_MOVIL: IconoTelefono,
  TRANSFERENCIA: IconoBanco,
  PUNTO_VENTA: IconoTarjeta,
  BIOPAGO: IconoHuella,
  CRIPTO: IconoCripto,
};

interface RespuestaTasa {
  valor?: number;
  fecha?: string;
  fuente?: string;
  error?: string;
}

// Lo que la Server Action devuelve sobre la tasa BCV (Etapa 3): la tasa
// cambió (tasaNueva) o no se pudo verificar en este momento (fallaTemporal).
// Ver EstadoFormularioPago en pagos/actions.ts.
export interface AvisoTasaServidor {
  tasaNueva?: number;
  fallaTemporal?: boolean;
  tasaGuardada?: number;
}

export function SelectorMetodoPago({
  metodos,
  monto,
  onCambio,
  idFormulario,
  grande = false,
  avisoServidor,
  ocultarNumeroOperacion = false,
  numeroOperacion: numeroOperacionProp,
  onCambioNumeroOperacion: onCambioNumeroOperacionProp,
}: {
  metodos: MetodoPago[];
  monto: number;
  onCambio: (seleccion: {
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
    // Si el método elegido pide número de operación (todos menos
    // Efectivo) — expuesto para que un padre con ocultarNumeroOperacion=true
    // sepa si debe pedir ese campo por su cuenta.
    requiereNumeroOperacion: boolean;
  }) => void;
  // El <Input> de "número de operación" vive dentro de este selector pero
  // el submit final es el <form> del padre — se enlaza con el atributo form=.
  idFormulario?: string;
  // Solo el wizard de Caja (ModalRegistrarPagoCaja) lo pide — el uso en
  // /miembros/[id] y /pagos/nuevo se queda con su tamaño actual.
  grande?: boolean;
  // Resultado de la última validación de tasa en el servidor (Etapa 3) — si
  // trae tasaNueva o fallaTemporal, se muestra el aviso correspondiente sin
  // cerrar el formulario ni perder los datos ya cargados.
  avisoServidor?: AvisoTasaServidor;
  // El wizard de Caja en modalidad Abono necesita el campo "Número de
  // operación" DESPUÉS del monto a abonar (ver diseño acordado). Con esto
  // en true, este componente deja de renderizarlo y de guardar su propio
  // estado — el padre pasa numeroOperacion/onCambioNumeroOperacion y
  // renderiza su propio <Input>, en el lugar que le convenga.
  ocultarNumeroOperacion?: boolean;
  numeroOperacion?: string;
  onCambioNumeroOperacion?: (valor: string) => void;
}) {
  const [tipoAbierto, setTipoAbierto] = useState<TipoMetodoPago | null>(null);
  const [metodoId, setMetodoId] = useState<string | null>(null);
  const [numeroOperacionInterno, setNumeroOperacionInterno] = useState("");
  // Controlado solo cuando el padre oculta el campo propio y toma el
  // control (ver ocultarNumeroOperacion) — el resto de los usos (Caja en
  // Total/Combinado, /miembros, /pagos/nuevo) siguen con el estado interno
  // de siempre, sin cambios de comportamiento.
  const numeroOperacion = ocultarNumeroOperacion ? (numeroOperacionProp ?? "") : numeroOperacionInterno;
  const setNumeroOperacion = ocultarNumeroOperacion
    ? (valor: string) => onCambioNumeroOperacionProp?.(valor)
    : setNumeroOperacionInterno;
  const [mostrarDatos, setMostrarDatos] = useState(false);

  const [tasa, setTasa] = useState<number | null>(null);
  const [errorTasa, setErrorTasa] = useState(false);
  const [modalTasaAbierto, setModalTasaAbierto] = useState(false);
  const [cargadaEnMs, setCargadaEnMs] = useState<number | null>(null);
  const [modalFallaTemporalAbierto, setModalFallaTemporalAbierto] = useState(false);

  const tiposDisponibles = Array.from(new Set(metodos.map((m) => m.tipo)));
  const metodo = metodos.find((m) => m.id === metodoId) ?? null;
  // EFECTIVO nunca abre el grid de "instancias" genérico (2 tarjetas con
  // nombre de banco) — su selección de moneda vive en su propia fila
  // (ver más abajo), igual que siempre. El resto de los tipos con más de
  // una instancia sí usa ese grid.
  const instanciasDelTipo = tipoAbierto && tipoAbierto !== "EFECTIVO" ? metodos.filter((m) => m.tipo === tipoAbierto) : [];
  const requiereNumeroOperacion = metodo ? metodo.tipo !== "EFECTIVO" : false;
  const esEnBs = metodo ? TIPOS_QUE_PUEDEN_SER_EN_BS.includes(metodo.tipo) && metodo.moneda === "BS" : false;

  async function cargarTasa() {
    setErrorTasa(false);
    try {
      const res = await fetch("/api/tasa-cambio");
      const datos: RespuestaTasa = await res.json();
      if (!res.ok || datos.valor === undefined) {
        setErrorTasa(true);
        return;
      }
      setTasa(datos.valor);
      setCargadaEnMs(Date.now());
    } catch {
      setErrorTasa(true);
    }
  }

  useEffect(() => {
    if (esEnBs && tasa === null) {
      cargarTasa();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar cuando se elige un método en Bs
  }, [esEnBs]);

  // Si el modal queda abierto más de 45 min con un método en Bs elegido,
  // se revalida la tasa una vez pasado ese intervalo (mismo throttle que
  // el orquestador del servidor).
  useEffect(() => {
    if (!esEnBs || cargadaEnMs === null) return;
    const intervalo = setInterval(() => {
      if (Date.now() - cargadaEnMs >= INTERVALO_REVALIDACION_MS) {
        cargarTasa();
      }
    }, 60_000);
    return () => clearInterval(intervalo);
  }, [esEnBs, cargadaEnMs]);

  // Reacciona a la respuesta de la Server Action (Etapa 3): la tasa cambió
  // en el servidor (reconfirmar con la nueva) o no se pudo verificar ahora
  // mismo (mostrar el aviso de las 3 opciones). No cierra el formulario ni
  // pierde los datos ya cargados.
  useEffect(() => {
    if (avisoServidor?.tasaNueva !== undefined) {
      setTasa(avisoServidor.tasaNueva);
      setCargadaEnMs(Date.now());
    }
    if (avisoServidor?.fallaTemporal) {
      setModalFallaTemporalAbierto(true);
    }
  }, [avisoServidor]);

  useEffect(() => {
    const tasaCambio = esEnBs ? tasa : null;
    onCambio({
      metodoPagoId: metodo?.id ?? null,
      metodo: metodo ? construirNombreMetodo(metodo) : "",
      requiereNumeroOperacion,
      tasaCambio,
      numeroOperacion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCambio se reconstruye cada render en el padre, no debe disparar el efecto
  }, [metodo, esEnBs, tasa, numeroOperacion]);

  function elegirTipo(tipo: TipoMetodoPago) {
    setTipoAbierto(tipo);
    const instancias = metodos.filter((m) => m.tipo === tipo);
    if (instancias.length === 1) {
      setMetodoId(instancias[0].id);
    } else {
      setMetodoId(null);
    }
  }

  const montoBs = esEnBs && tasa !== null ? monto * tasa : null;
  const textoTipo = grande ? "text-sm" : "text-xs";
  const textoInstancia = grande ? "text-base" : "text-sm";
  const textoEfectivo = grande ? "text-base" : "text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {tiposDisponibles.map((tipo) => {
          const Icono = ICONO_TIPO[tipo];
          const seleccionado = tipoAbierto === tipo;
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => elegirTipo(tipo)}
              className="flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-colors duration-150 active:scale-95"
              style={
                seleccionado
                  ? { borderColor: "var(--gx-accent)", background: "color-mix(in srgb, var(--gx-accent) 12%, transparent)" }
                  : { borderColor: "var(--gx-edge)" }
              }
            >
              <span style={{ color: seleccionado ? "var(--gx-accent)" : "var(--gx-muted)" }}>
                <Icono />
              </span>
              <span className={`${textoTipo} font-medium text-center`} style={{ color: "var(--gx-ink)" }}>
                {ETIQUETA_TIPO_METODO_PAGO[tipo]}
              </span>
            </button>
          );
        })}
      </div>

      {tipoAbierto && instanciasDelTipo.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {instanciasDelTipo.map((instancia) => (
            <button
              key={instancia.id}
              type="button"
              onClick={() => setMetodoId(instancia.id)}
              className="flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition-colors duration-150 active:scale-95"
              style={
                metodoId === instancia.id
                  ? { borderColor: "var(--gx-accent)", background: "color-mix(in srgb, var(--gx-accent) 12%, transparent)" }
                  : { borderColor: "var(--gx-edge)" }
              }
            >
              {instancia.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo servido desde R2
                <img src={instancia.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-full" style={{ background: "var(--gx-surface-2)" }} />
              )}
              <span className={`${textoInstancia} font-medium`} style={{ color: "var(--gx-ink)" }}>
                {instancia.nombreBanco}
              </span>
            </button>
          ))}
        </div>
      )}

      {tipoAbierto === "EFECTIVO" && metodos.filter((m) => m.tipo === "EFECTIVO").length > 1 && (
        <div className="flex gap-2">
          {metodos
            .filter((m) => m.tipo === "EFECTIVO")
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetodoId(m.id)}
                className={`min-h-10 flex-1 rounded-lg border-2 ${textoEfectivo} font-medium transition-colors duration-150`}
                style={
                  metodoId === m.id
                    ? { borderColor: "var(--gx-accent)", background: "color-mix(in srgb, var(--gx-accent) 12%, transparent)" }
                    : { borderColor: "var(--gx-edge)" }
                }
              >
                {m.moneda === "USD" ? "USD" : "Bs"}
              </button>
            ))}
        </div>
      )}

      {metodo && metodo.tipo !== "EFECTIVO" && metodo.tipo !== "PUNTO_VENTA" && metodo.tipo !== "BIOPAGO" && (
        <Button type="button" variant="secundario" onClick={() => setMostrarDatos(true)}>
          Ver datos para el pago
        </Button>
      )}

      {requiereNumeroOperacion && !ocultarNumeroOperacion && (
        <Input
          form={idFormulario}
          label="Número de operación (últimos 4 dígitos)"
          required
          maxLength={4}
          pattern="[0-9]{4}"
          value={numeroOperacion}
          onChange={(e) => setNumeroOperacion(e.target.value)}
        />
      )}

      {esEnBs && tasa !== null && (
        <div
          className={`rounded-lg border p-3 ${grande ? "text-base" : "text-sm"}`}
          style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}
        >
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Tasa BCV</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              Bs. {tasa}
            </span>
          </div>
          {montoBs !== null && (
            <div className="mt-1 flex justify-between">
              <span style={{ color: "var(--gx-muted)" }}>Monto en bolívares</span>
              <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                Bs. {formatearBs(montoBs)}
              </span>
            </div>
          )}
        </div>
      )}

      {esEnBs && errorTasa && (
        <ModalErrorTasa
          onReintentar={cargarTasa}
          onIngresarManual={() => setModalTasaAbierto(true)}
        />
      )}

      {modalTasaAbierto && (
        <ModalIngresoManualTasa
          onCerrar={() => setModalTasaAbierto(false)}
          onGuardado={(valor) => {
            setTasa(valor);
            setErrorTasa(false);
            setModalTasaAbierto(false);
          }}
        />
      )}

      {mostrarDatos && metodo && <ModalDatosPago metodo={metodo} onCerrar={() => setMostrarDatos(false)} />}

      {modalFallaTemporalAbierto && avisoServidor?.fallaTemporal && (
        <ModalFallaTemporalTasa
          tasaGuardada={avisoServidor.tasaGuardada ?? tasa ?? 0}
          onUsarGuardada={() => setModalFallaTemporalAbierto(false)}
          onIngresarManual={() => {
            setModalFallaTemporalAbierto(false);
            setModalTasaAbierto(true);
          }}
        />
      )}
    </div>
  );
}

function ModalErrorTasa({ onReintentar, onIngresarManual }: { onReintentar: () => void; onIngresarManual: () => void }) {
  return (
    <div className="rounded-lg border-2 p-4" style={{ borderColor: "var(--gx-bad)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
        No se obtuvo la tasa actualizada
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--gx-muted)" }}>
        Puede ser un problema temporal, o puedes ingresar la tasa manualmente consultándola en el BCV.
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secundario" className="flex-1" onClick={onReintentar}>
          Reintentar
        </Button>
        <Button type="button" className="flex-1" onClick={onIngresarManual}>
          Ingresar manualmente
        </Button>
      </div>
    </div>
  );
}

// Se muestra cuando la Server Action no pudo verificar la tasa BCV justo al
// forzar la validación en el momento de cobrar (fallo temporal de DolarAPI,
// no un cambio de tasa) — Etapa 3 del plan. Bloquea el registro hasta que el
// operador decide: usar la última guardada igual, verificar en el sitio
// oficial, o ingresarla manualmente.
// Exportado: lo reusa ModalRegistrarEgreso.tsx.
export function ModalFallaTemporalTasa({
  tasaGuardada,
  onUsarGuardada,
  onIngresarManual,
}: {
  tasaGuardada: number;
  onUsarGuardada: () => void;
  onIngresarManual: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
    >
      <div className="w-full max-w-sm rounded-2xl border-2 p-6" style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}>
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          No se pudo verificar la tasa BCV
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--gx-muted)" }}>
          Hubo un problema temporal para confirmar si la tasa cambió. La última guardada es{" "}
          <strong>Bs. {tasaGuardada}</strong>.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" className="w-full" onClick={onUsarGuardada}>
            Usar Bs. {tasaGuardada} igual
          </Button>
          <a
            href="https://bcv.org.ve/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 w-full items-center justify-center rounded-lg border-2 text-sm font-medium transition-colors duration-150"
            style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            Verificar en bcv.org.ve
          </a>
          <Button type="button" variant="secundario" className="w-full" onClick={onIngresarManual}>
            Ingresar el valor manualmente
          </Button>
        </div>
      </div>
    </div>
  );
}

// Exportado: lo reusa ModalRegistrarEgreso.tsx (mismo flujo de ingreso
// manual, fuera del árbol de SelectorMetodoPago).
export function ModalIngresoManualTasa({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: (valor: number) => void }) {
  const [valor, setValor] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valorNumero = Number(valor);
  const esValido = valor.trim() !== "" && !Number.isNaN(valorNumero) && valorNumero > 0;
  const { mostrarExito, mostrarError } = useFeedback();

  async function confirmar() {
    setEnviando(true);
    setError(null);
    const formData = new FormData();
    formData.set("valor", valor);
    const resultado = await registrarTasaManualAction({}, formData);
    setEnviando(false);
    if (resultado.error) {
      setError(resultado.error);
      mostrarError(resultado.error);
      return;
    }
    if (resultado.ok) mostrarExito(resultado.ok);
    onGuardado(valorNumero);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
    >
      <div className="w-full max-w-sm rounded-2xl border-2 p-6" style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}>
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          Ingresar tasa manualmente
        </h3>
        <p className="mt-1 text-xs" style={{ color: "var(--gx-muted)" }}>
          Consultá el valor en el sitio oficial del BCV. Se acepta hasta dos decimales.
        </p>

        {!confirmando ? (
          <>
            <CurrencyInput
              name="tasaManual"
              label="Tasa BCV (Bs. por USD)"
              moneda="Bs"
              className="mt-4"
              value={valor}
              onChange={(nuevoValor) => setValor(nuevoValor)}
            />
            <div className="mt-4 flex gap-3">
              <Button type="button" variant="secundario" className="flex-1" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button type="button" className="flex-1" disabled={!esValido} onClick={() => setConfirmando(true)}>
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm" style={{ color: "var(--gx-ink)" }}>
              Confirmá que la tasa es <strong>Bs. {valorNumero.toFixed(2)}</strong> por dólar. Este valor se usará
              para todos los pagos en bolívares hasta que se actualice.
            </p>
            {error && (
              <p className="mt-2 rounded-lg px-3 py-2 text-sm" style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}>
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <Button type="button" variant="secundario" className="flex-1" onClick={() => setConfirmando(false)} disabled={enviando}>
                Volver
              </Button>
              <Button type="button" className="flex-1" onClick={confirmar} disabled={enviando}>
                {enviando ? "Guardando..." : "Sí, confirmar tasa"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModalDatosPago({ metodo, onCerrar }: { metodo: MetodoPago; onCerrar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
    >
      <div className="w-full max-w-sm rounded-2xl border-2 p-6" style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}>
        <div className="flex items-center gap-3">
          {metodo.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo servido desde R2
            <img src={metodo.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          )}
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            {ETIQUETA_TIPO_METODO_PAGO[metodo.tipo]}
            {metodo.nombreBanco ? ` - ${metodo.nombreBanco}` : ""}
          </h3>
        </div>

        <dl className="mt-4 flex flex-col gap-2 text-sm">
          {metodo.codigoBanco && <Dato label="Código" valor={metodo.codigoBanco} />}
          {metodo.telefono && <Dato label="Teléfono" valor={metodo.telefono} />}
          {metodo.rif && <Dato label="RIF / Cédula" valor={metodo.rif} />}
          {metodo.beneficiario && <Dato label="Beneficiario" valor={metodo.beneficiario} />}
          {metodo.numeroCuenta && <Dato label="Cuenta" valor={metodo.numeroCuenta} />}
          {metodo.walletDireccion && <Dato label="Wallet / ID" valor={metodo.walletDireccion} />}
          {metodo.walletUsuario && <Dato label="Usuario" valor={metodo.walletUsuario} />}
        </dl>

        {metodo.qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- QR servido desde R2
          <img src={metodo.qrUrl} alt="Código QR" className="mx-auto mt-4 h-40 w-40" />
        )}

        <Button type="button" className="mt-5 w-full" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: "var(--gx-muted)" }}>{label}</dt>
      <dd className="font-medium" style={{ color: "var(--gx-ink)" }}>
        {valor}
      </dd>
    </div>
  );
}
