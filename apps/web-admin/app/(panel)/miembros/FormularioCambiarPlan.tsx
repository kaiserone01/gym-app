"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { calcularCambioPlan, PlanCortesiaConTiempoRestanteError, type ModoCambioPlan, type ResultadoCambioPlan } from "@gym-app/domain/entities/cambioPlanCalculo";
import type { EstadoCambioPlan } from "../pagos/actions";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { useHayCambiosSinGuardar } from "./ContextoCambiosSinGuardar";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  DIARIO: "diario",
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
};

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

// Lo que el padre (ContenidoPaso2 del wizard de Caja) necesita para mostrar
// UN solo pronóstico coherente con el botón que el operador va a tocar —
// corrige E6 (el cuadro de renovación mostraba un cálculo distinto, sin
// prorratear, al de los botones de acá). null cuando no hay plan nuevo
// elegido o el modo todavía no se decidió (ningún botón preseleccionado).
export interface ProyeccionCambioPlan {
  modo: ModoCambioPlan;
  resultado: ResultadoCambioPlan;
}

export function FormularioCambiarPlan({
  accion,
  miembroId,
  planes,
  planActualId,
  precioActual,
  frecuenciaActual,
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
  // frecuencia del plan nuevo (ver diseño acordado, ya no se restringe a
  // la misma frecuencia).
  precioActual: number;
  frecuenciaActual: FrecuenciaPago;
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
  // Avisa al wizard de Caja el resultado exacto (modo + cálculo) que
  // corresponde al botón que el operador tiene resaltado — ContenidoPaso2
  // lo usa para reemplazar su propio cuadro de renovación (que no
  // prorrateaba, ver E6) por este mismo número. null si no hay nada
  // elegido todavía.
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
  let prorrateoAjustar: ResultadoCambioPlan | null = null;
  let prorrateoCicloCompleto: ResultadoCambioPlan | null = null;
  let errorCortesia: string | null = null;

  if (planNuevo) {
    const datosBase = {
      hoy: new Date(),
      precioViejo: precioActual,
      diasCicloViejo: DURACION_DIAS_POR_FRECUENCIA[frecuenciaActual],
      fechaVencimientoActual,
      precioNuevo: planNuevo.precioUSD,
      diasCicloNuevo: DURACION_DIAS_POR_FRECUENCIA[planNuevo.frecuencia],
    };
    try {
      prorrateoAjustar = calcularCambioPlan({ ...datosBase, modo: "AJUSTAR_VENCIMIENTO" });
      prorrateoCicloCompleto = calcularCambioPlan({ ...datosBase, modo: "CICLO_COMPLETO" });
    } catch (error) {
      if (error instanceof PlanCortesiaConTiempoRestanteError) {
        errorCortesia = error.message;
      } else {
        throw error;
      }
    }
  }

  // Ningún botón viene preseleccionado por defecto (ver diseño acordado,
  // regla 10) — modoElegido arranca en null y solo se fija cuando el
  // operador toca uno de los dos botones.
  const [modoElegido, setModoElegido] = useState<ModoCambioPlan | null>(null);
  const requiereEntrenador = planNuevo?.incluyeEntrenador ?? false;
  const montoCicloCompleto = prorrateoCicloCompleto ? prorrateoCicloCompleto.montoCobradoCentavos / 100 : 0;

  // Avisa al padre (ContenidoPaso2 del wizard de Caja) cuál es el pronóstico
  // que corresponde al botón resaltado — corrige E6, ver ProyeccionCambioPlan.
  useEffect(() => {
    if (!onProyeccionCambiada) return;
    if (!modoElegido) {
      onProyeccionCambiada(null);
      return;
    }
    const resultado = modoElegido === "AJUSTAR_VENCIMIENTO" ? prorrateoAjustar : prorrateoCicloCompleto;
    onProyeccionCambiada(resultado ? { modo: modoElegido, resultado } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se recalcula con cada render de este componente (planNuevo/fechas ya están en las deps de arriba); solo evita un bucle infinito si onProyeccionCambiada no es estable
  }, [modoElegido, prorrateoAjustar, prorrateoCicloCompleto]);

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
            setModoElegido(null);
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

      {planNuevo && montoCicloCompleto > 0 && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={montoCicloCompleto}
          onCambio={setSeleccionMetodo}
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
        />
      )}

      {planNuevo && planNuevo.id !== planActualId && !errorCortesia && prorrateoAjustar && prorrateoCicloCompleto && (
        <div className="flex flex-col gap-2">
          {/* Cada botón integra su propio detalle (antes eran una card
              informativa separada arriba de un botón de solo texto — daba
              la sensación de 4 opciones cuando son solo 2, ver feedback). */}
          <Button
            type="submit"
            name="modo"
            value="AJUSTAR_VENCIMIENTO"
            variant="secundario"
            disabled={enviando || (requiereEntrenador && !entrenadorId)}
            onClick={() => setModoElegido("AJUSTAR_VENCIMIENTO")}
            className="flex min-h-fit flex-col items-start gap-1 py-3 text-left"
          >
            <span className="font-semibold">
              {enviando && modoElegido === "AJUSTAR_VENCIMIENTO" ? "Guardando..." : "Solo ajustar vencimiento"}
            </span>
            <span className="text-xs font-normal" style={{ color: "var(--gx-muted)" }}>
              Nuevo vencimiento: {prorrateoAjustar.nuevoVencimiento.toLocaleDateString("es-VE")} — sin costo
              adicional.
            </span>
          </Button>
          <Button
            type="submit"
            name="modo"
            value="CICLO_COMPLETO"
            disabled={enviando || (requiereEntrenador && !entrenadorId) || (montoCicloCompleto > 0 && !seleccionMetodo.metodoPagoId)}
            onClick={() => setModoElegido("CICLO_COMPLETO")}
            className="flex min-h-fit flex-col items-start gap-1 py-3 text-left"
          >
            <span className="font-semibold">
              {enviando && modoElegido === "CICLO_COMPLETO"
                ? "Guardando..."
                : montoCicloCompleto > 0
                  ? `Pagar ciclo completo — cobrar $${montoCicloCompleto.toFixed(2)}`
                  : "Pagar ciclo completo"}
            </span>
            <span className="text-xs font-normal" style={{ color: "var(--gx-accent-ink)", opacity: 0.85 }}>
              Nuevo vencimiento: {prorrateoCicloCompleto.nuevoVencimiento.toLocaleDateString("es-VE")}
            </span>
          </Button>
        </div>
      )}
    </form>
  );
}
