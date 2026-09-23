"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { EstadoCambioPlan } from "../pagos/actions";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";

export interface PlanParaCambio {
  id: string;
  nombre: string;
  precioUSD: number;
  frecuencia: FrecuenciaPago;
}

export function FormularioCambiarPlan({
  accion,
  miembroId,
  planes,
  planActualId,
  precioActual,
  frecuenciaActual,
  metodosPago,
}: {
  accion: (estado: EstadoCambioPlan, formData: FormData) => Promise<EstadoCambioPlan>;
  miembroId: string;
  planes: PlanParaCambio[];
  planActualId: string | null;
  precioActual: number;
  // Cobrar "solo la diferencia" no mueve el vencimiento — solo tiene
  // sentido entre planes de la misma frecuencia (ambos mensuales, ambos
  // semanales...). Un cambio de frecuencia se filtra del selector; para
  // eso corresponde un pago normal por el precio completo (ver diseño
  // acordado).
  frecuenciaActual: FrecuenciaPago;
  metodosPago: MetodoPago[];
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

  const [planNuevoId, setPlanNuevoId] = useState("");
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });

  const planesMismaFrecuencia = planes.filter((p) => p.frecuencia === frecuenciaActual);
  const planNuevo = planesMismaFrecuencia.find((p) => p.id === planNuevoId) ?? null;
  const diferencia = planNuevo ? Math.round(Math.max(0, planNuevo.precioUSD - precioActual) * 100) / 100 : 0;
  const requierePago = diferencia > 0;
  const puedeEnviar = !!planNuevo && planNuevo.id !== planActualId && (!requierePago || !!seleccionMetodo.metodoPagoId);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {estado.error}
        </p>
      )}

      <input type="hidden" name="miembroId" value={miembroId} />
      <input type="hidden" name="planNuevoId" value={planNuevoId} />
      <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
      <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
      <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
      <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Plan nuevo
        <select
          value={planNuevoId}
          onChange={(e) => setPlanNuevoId(e.target.value)}
          className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        >
          <option value="">Seleccioná un plan</option>
          {planesMismaFrecuencia.map((plan) => (
            <option key={plan.id} value={plan.id} disabled={plan.id === planActualId}>
              {plan.nombre} (${plan.precioUSD.toFixed(2)}){plan.id === planActualId ? " — plan actual" : ""}
            </option>
          ))}
        </select>
      </label>

      {planes.length > planesMismaFrecuencia.length && (
        <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
          Solo se muestran planes de la misma frecuencia que el actual — cobrar la diferencia no mueve el
          vencimiento, así que no aplica entre semanal, quincenal y mensual. Para cambiar a otra frecuencia, usá
          &quot;Registrar pago&quot; por el precio completo.
        </p>
      )}

      {planNuevo && planNuevo.id !== planActualId && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan actual</span>
            <span style={{ color: "var(--gx-ink)" }}>${precioActual.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan nuevo</span>
            <span style={{ color: "var(--gx-ink)" }}>${planNuevo.precioUSD.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span style={{ color: "var(--gx-ink)" }}>{requierePago ? "Diferencia a cobrar" : "Sin costo adicional"}</span>
            <span style={{ color: "var(--gx-ink)" }}>{requierePago ? `$${diferencia.toFixed(2)}` : "$0.00"}</span>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--gx-muted)" }}>
            El vencimiento actual no cambia — el ciclo ya pagado sigue igual.
          </p>
        </div>
      )}

      {requierePago && <SelectorMetodoPago metodos={metodosPago} monto={diferencia} onCambio={setSeleccionMetodo} />}

      <Button type="submit" disabled={enviando || !puedeEnviar}>
        {enviando ? "Guardando..." : requierePago ? "Cobrar diferencia y cambiar plan" : "Cambiar plan"}
      </Button>
    </form>
  );
}
