"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { Card } from "@gym-app/ui/components/Card";
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

export function FormularioEgreso({
  accion,
  turnoId,
}: {
  accion: (estado: EstadoRegistrarEgreso, formData: FormData) => Promise<EstadoRegistrarEgreso>;
  turnoId: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) mostrarExito(estado.ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito
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

  useEffect(() => {
    if (moneda !== "BS" || tasa !== null) return;
    setCargandoTasa(true);
    fetch("/api/tasa-cambio")
      .then((res) => res.json())
      .then((datos: { valor?: number }) => {
        if (datos.valor !== undefined) setTasa(datos.valor);
      })
      .catch(() => {})
      .finally(() => setCargandoTasa(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar al elegir un método en Bs
  }, [moneda]);

  return (
    <Card>
      <form action={enviar} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--gx-ink)" }}>
          Registrar egreso
        </h3>

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

        <Button variant="secundario" type="submit" disabled={enviando || (moneda === "BS" && tasa === null)}>
          {enviando ? "Registrando..." : "Registrar egreso"}
        </Button>
      </form>
    </Card>
  );
}
