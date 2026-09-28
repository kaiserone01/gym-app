"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { calcularCambioPlan, PlanCortesiaConTiempoRestanteError, type ResultadoCambioPlan } from "@gym-app/domain/entities/cambioPlanCalculo";
import type { EstadoCambioPlan } from "../pagos/actions";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { useHayCambiosSinGuardar } from "./ContextoCambiosSinGuardar";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  DIARIO: "diario",
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
  SEMESTRAL: "semestral",
  ANUAL: "anual",
  PERSONALIZADO: "personalizado",
};

export interface PlanParaCambio {
  id: string;
  nombre: string;
  precioUSD: number;
  frecuencia: FrecuenciaPago;
  diasCiclo: number;
  incluyeEntrenador: boolean;
}

export interface EntrenadorParaCambio {
  id: string;
  nombre: string;
}

// Lo que el padre (ContenidoPaso2 del wizard de Caja) necesita para mostrar
// el pronóstico del único camino de cálculo — corrige E6 (el cuadro de
// renovación mostraba un cálculo distinto, sin prorratear). null cuando no
// hay plan nuevo elegido.
export interface ProyeccionCambioPlan {
  resultado: ResultadoCambioPlan;
}

export function FormularioCambiarPlan({
  accion,
  miembroId,
  planes,
  planActualId,
  precioActual,
  diasCicloActual,
  fechaVencimientoActual,
  metodosPago,
  entrenadores,
  entrenadorActualId,
  origen,
  onCambiado,
  onPlanNuevoCambiado,
  onProyeccionCambiada,
}: {
  accion: (estado: EstadoCambioPlan, formData: FormData) => Promise<EstadoCambioPlan>;
  miembroId: string;
  planes: PlanParaCambio[];
  planActualId: string | null;
  // Precio y vencimiento vigentes del plan actual — calcularCambioPlan los
  // usa para calcular el valor no consumido del ciclo, sin importar la
  // duración del ciclo del plan nuevo (ver diseño acordado, ya no se
  // restringe a la misma frecuencia).
  precioActual: number;
  diasCicloActual: number;
  fechaVencimientoActual: Date;
  metodosPago: MetodoPago[];
  // Entrenadores elegibles para la sede del miembro — se muestra el
  // selector solo si el plan nuevo elegido incluye entrenador (único plan
  // con entrenador: $30 mensual, ver diseño acordado).
  entrenadores: EntrenadorParaCambio[];
  entrenadorActualId: string | null;
  // "caja" cuando se usa dentro del wizard de Caja — cambia el
  // comportamiento post-envío del lado del servidor (ver cambiarPlanAction):
  // no navega afuera del modal, solo confirma y dispara onCambiado.
  origen?: "caja";
  // Solo relevante con origen "caja" — se llama tras confirmar el cambio,
  // para que el wizard cierre el modal (ver diseño acordado).
  onCambiado?: () => void;
  // Avisa al wizard de Caja qué plan quedó elegido en el <select> "Plan
  // nuevo" (o null si no hay ninguno) — el padre lo usa para recalcular en
  // vivo la proyección de días/vencimiento que muestra debajo (ver
  // feedback: no reaccionaba porque planNuevoId es estado interno acá).
  onPlanNuevoCambiado?: (plan: PlanParaCambio | null) => void;
  // Avisa al wizard de Caja el resultado exacto del único camino de cálculo
  // — ContenidoPaso2 lo usa para reemplazar su propio cuadro de renovación
  // (que no prorrateaba, ver E6) por este mismo número. null si no hay
  // nada elegido todavía.
  onProyeccionCambiada?: (proyeccion: ProyeccionCambioPlan | null) => void;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarError, mostrarExito } = useFeedback();
  const hayCambiosSinGuardar = useHayCambiosSinGuardar();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  // Con origen "caja", cambiarPlanAction no redirige — confirma acá mismo
  // y avisa al wizard que ya terminó (ver diseño acordado: cierra el modal
  // en vez de navegar afuera).
  useEffect(() => {
    if (origen === "caja" && estado.ok) {
      mostrarExito(estado.ok);
      onCambiado?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok
  }, [estado.ok]);

  const [planNuevoId, setPlanNuevoId] = useState("");
  const [entrenadorId, setEntrenadorId] = useState(entrenadorActualId ?? "");
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });

  const planNuevo = planes.find((p) => p.id === planNuevoId) ?? null;

  // Cortesía ($0) con tiempo restante — calcularCambioPlan bloquea este
  // caso lanzando PlanCortesiaConTiempoRestanteError (regla 6 del diseño
  // acordado: nunca se regala el tiempo restante). Acá se atrapa para
  // mostrar el mensaje en vez de romper el render.
  let resultado: ResultadoCambioPlan | null = null;
  let errorCortesia: string | null = null;

  if (planNuevo) {
    try {
      resultado = calcularCambioPlan({
        hoy: new Date(),
        precioViejo: precioActual,
        diasCicloViejo: diasCicloActual,
        fechaVencimientoActual,
        precioNuevo: planNuevo.precioUSD,
        diasCicloNuevo: planNuevo.diasCiclo,
      });
    } catch (error) {
      if (error instanceof PlanCortesiaConTiempoRestanteError) {
        errorCortesia = error.message;
      } else {
        throw error;
      }
    }
  }

  const requiereEntrenador = planNuevo?.incluyeEntrenador ?? false;
  const montoACobrar = resultado ? resultado.montoCobradoCentavos / 100 : 0;

  // Avisa al padre (ContenidoPaso2 del wizard de Caja) cuál es el pronóstico
  // del único camino de cálculo — corrige E6, ver ProyeccionCambioPlan.
  useEffect(() => {
    if (!onProyeccionCambiada) return;
    onProyeccionCambiada(resultado ? { resultado } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se recalcula con cada render de este componente (planNuevo/fechas ya están en las deps de arriba); solo evita un bucle infinito si onProyeccionCambiada no es estable
  }, [resultado]);

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
      {origen && <input type="hidden" name="origen" value={origen} />}

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Plan nuevo
        <select
          value={planNuevoId}
          onChange={(e) => {
            setPlanNuevoId(e.target.value);
            onPlanNuevoCambiado?.(planes.find((p) => p.id === e.target.value) ?? null);
          }}
          className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        >
          <option value="">Seleccioná un plan</option>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id} disabled={plan.id === planActualId}>
              {plan.nombre} — ${plan.precioUSD.toFixed(2)} ({ETIQUETA_FRECUENCIA[plan.frecuencia]})
              {plan.id === planActualId ? " — plan actual" : ""}
            </option>
          ))}
        </select>
      </label>

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

      {planNuevo && errorCortesia && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {errorCortesia}
        </p>
      )}

      {planNuevo && montoACobrar > 0 && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={montoACobrar}
          onCambio={setSeleccionMetodo}
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
        />
      )}

      {planNuevo && planNuevo.id !== planActualId && !errorCortesia && resultado && (
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={enviando || (requiereEntrenador && !entrenadorId) || (montoACobrar > 0 && !seleccionMetodo.metodoPagoId)}
            className="flex min-h-fit flex-col items-start gap-1 py-3 text-left"
          >
            <span className="font-semibold">
              {enviando
                ? "Guardando..."
                : montoACobrar > 0
                  ? `Cambiar de plan — cobrar $${montoACobrar.toFixed(2)}`
                  : "Cambiar de plan — sin costo adicional"}
            </span>
            <span className="text-xs font-normal" style={{ color: "var(--gx-accent-ink)", opacity: 0.85 }}>
              Nuevo vencimiento: {resultado.nuevoVencimiento.toLocaleDateString("es-VE")}
            </span>
          </Button>
        </div>
      )}
    </form>
  );
}
