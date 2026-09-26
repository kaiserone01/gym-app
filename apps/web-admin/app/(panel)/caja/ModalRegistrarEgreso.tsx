"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoRegistrarEgreso } from "./actions";

// Los "value" deben coincidir exactamente con el snapshot que
// construirNombreMetodo() genera para MetodoPago.tipo === "EFECTIVO" (ver
// configuraciones/metodosPagoUI.ts) — es el mismo formato que usan los
// Pagos en efectivo, así un retiro de caja resta de la misma línea del
// arqueo donde se suman esos pagos (ver ObtenerResumenTurno).
const METODOS_EGRESO = [
  { value: "Efectivo (USD)", label: "Efectivo (USD)", moneda: "USD" as const },
  { value: "Efectivo (Bs)", label: "Efectivo (Bs)", moneda: "BS" as const },
];

// Refresco perezoso (Etapa 2 del plan de tasa BCV): si el modal queda
// abierto más de 45 min en Bs, se vuelve a pedir la tasa (mismo criterio
// que SelectorMetodoPago).
const INTERVALO_REVALIDACION_MS = 45 * 60_000;

// Antes vivía siempre visible como un formulario grande en la pantalla de
// Caja (ver diseño acordado: "Registrar egreso" ocupaba mucho espacio). Se
// convierte en modal, mismo patrón que ModalRegistrarPagoCaja — un botón
// chico en la barra de acciones lo abre.
export function ModalRegistrarEgreso({
  accion,
  turnoId,
  onCerrar,
}: {
  accion: (estado: EstadoRegistrarEgreso, formData: FormData) => Promise<EstadoRegistrarEgreso>;
  turnoId: string;
  onCerrar: () => void;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) {
      mostrarExito(estado.ok);
      onCerrar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito/onCerrar
  }, [estado.ok]);

  const [metodo, setMetodo] = useState(METODOS_EGRESO[0].value);
  const moneda = METODOS_EGRESO.find((m) => m.value === metodo)?.moneda ?? "USD";
  const [monto, setMonto] = useState("");
  const montoNumero = Number(monto) || 0;

  // Tasa BCV vigente — se consulta al elegir un método en Bs (mismo
  // mecanismo que SelectorMetodoPago) para poder guardar la referencia en
  // USD del egreso (ver Egreso.tasaCambio/montoUSD).
  const [tasa, setTasa] = useState<number | null>(null);
  const [cargandoTasa, setCargandoTasa] = useState(false);
  const [cargadaEnMs, setCargadaEnMs] = useState<number | null>(null);

  function cargarTasa() {
    setCargandoTasa(true);
    fetch("/api/tasa-cambio")
      .then((res) => res.json())
      .then((datos: { valor?: number }) => {
        if (datos.valor !== undefined) {
          setTasa(datos.valor);
          setCargadaEnMs(Date.now());
        }
      })
      .catch(() => {})
      .finally(() => setCargandoTasa(false));
  }

  useEffect(() => {
    if (moneda !== "BS" || tasa !== null) return;
    cargarTasa();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar al elegir un método en Bs
  }, [moneda]);

  // Si el modal queda abierto más de 45 min con Bs elegido, revalida la tasa.
  useEffect(() => {
    if (moneda !== "BS" || cargadaEnMs === null) return;
    const intervalo = setInterval(() => {
      if (Date.now() - cargadaEnMs >= INTERVALO_REVALIDACION_MS) {
        cargarTasa();
      }
    }, 60_000);
    return () => clearInterval(intervalo);
  }, [moneda, cargadaEnMs]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          Registrar egreso
        </h3>

        <form action={enviar} className="mt-4 flex flex-col gap-3">
          {estado.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
            >
              {estado.error}
            </p>
          )}

          <input type="hidden" name="turnoId" value={turnoId} />
          <input type="hidden" name="moneda" value={moneda} />
          <input type="hidden" name="tasaCambio" value={moneda === "BS" && tasa !== null ? tasa : ""} />

          <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Método
            <select
              name="metodo"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              {METODOS_EGRESO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <CurrencyInput
            name="monto"
            label="Monto"
            moneda={moneda === "USD" ? "USD" : "Bs"}
            required
            value={monto}
            onChange={setMonto}
          />
          {moneda === "BS" && (
            <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
              {cargandoTasa && "Consultando tasa BCV..."}
              {!cargandoTasa && tasa !== null && montoNumero > 0 && `Ref: $${(montoNumero / tasa).toFixed(2)} (tasa ${tasa})`}
              {!cargandoTasa && tasa === null && (
                <span style={{ color: "var(--gx-bad)" }}>No se pudo obtener la tasa BCV — no se puede registrar.</span>
              )}
            </p>
          )}
          <Input name="motivo" label="Motivo" required />

          <div className="mt-2 flex gap-3">
            <Button type="button" variant="secundario" className="flex-1" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              variant="peligro"
              type="submit"
              className="flex-1"
              disabled={enviando || (moneda === "BS" && tasa === null)}
            >
              {enviando ? "Registrando..." : "Registrar egreso"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
