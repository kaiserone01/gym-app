"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { EstadoCambioPlan } from "../pagos/actions";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { useHayCambiosSinGuardar } from "./ContextoCambiosSinGuardar";

export interface PlanParaCambio {
  id: string;
  nombre: string;
  precioUSD: number;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
}

export interface EntrenadorParaCambio {
  id: string;
  nombre: string;
}

export function FormularioCambiarPlan({
  accion,
  miembroId,
  planes,
  planActualId,
  precioActual,
  frecuenciaActual,
  metodosPago,
  entrenadores,
  entrenadorActualId,
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
  // Entrenadores elegibles para la sede del miembro — se muestra el
  // selector solo si el plan nuevo elegido incluye entrenador (único plan
  // con entrenador: $30 mensual, ver diseño acordado).
  entrenadores: EntrenadorParaCambio[];
  entrenadorActualId: string | null;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarError } = useFeedback();
  const hayCambiosSinGuardar = useHayCambiosSinGuardar();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  const [planNuevoId, setPlanNuevoId] = useState("");
  const [entrenadorId, setEntrenadorId] = useState(entrenadorActualId ?? "");
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
  const requiereEntrenador = planNuevo?.incluyeEntrenador ?? false;
  const puedeEnviar =
    !!planNuevo &&
    planNuevo.id !== planActualId &&
    (!requierePago || !!seleccionMetodo.metodoPagoId) &&
    (!requiereEntrenador || !!entrenadorId);

  return (
    <form
      action={enviar}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        // Al confirmar, esta acción redirige a /miembros — si hay cambios de
        // Datos personales sin guardar, se perderían sin este aviso.
        if (
          hayCambiosSinGuardar &&
          !window.confirm(
            "Tenés cambios sin guardar en Datos personales — se van a perder si cambiás de plan ahora. ¿Continuar de todas formas?"
          )
        ) {
          e.preventDefault();
        }
      }}
    >
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
      <input type="hidden" name="entrenadorId" value={entrenadorId} />
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

      {requiereEntrenador && (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Entrenador
          <select
            value={entrenadorId}
            onChange={(e) => setEntrenadorId(e.target.value)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="">Seleccioná un entrenador</option>
            {entrenadores.map((entrenador) => (
              <option key={entrenador.id} value={entrenador.id}>
                {entrenador.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs" style={{ color: "var(--gx-muted-dim)" }}>
            Este plan incluye entrenador — hace falta elegir uno para poder cambiar.
          </span>
        </label>
      )}

      {requierePago && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={diferencia}
          onCambio={setSeleccionMetodo}
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
        />
      )}

      <Button type="submit" disabled={enviando || !puedeEnviar}>
        {enviando ? "Guardando..." : requierePago ? "Cobrar diferencia y cambiar plan" : "Cambiar plan"}
      </Button>
    </form>
  );
}
