"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoFormularioPago } from "./actions";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { SelectorMetodoPago } from "./SelectorMetodoPago";
import { SelectorMiembroModal, type MiembroConPlan } from "../caja/SelectorMiembroModal";

export interface MiembroParaSelector {
  id: string;
  nombre: string;
}

export interface PlanParaSelector {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
}

export interface PlanFijo {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
}

export function FormularioPago({
  accion,
  miembros,
  planes,
  metodosPago,
  miembroIdFijo,
  planFijo,
  origen,
  miembrosConPlan,
}: {
  accion: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  miembros: MiembroParaSelector[];
  planes: PlanParaSelector[];
  metodosPago: MetodoPago[];
  miembroIdFijo?: string;
  // Cuando se pasa, el pago se registra directo contra este plan (el
  // vigente en la ficha del miembro) sin selector — ver diseño acordado:
  // "el valor de esa membresía es lo que se toma en cuenta".
  planFijo?: PlanFijo;
  /** Marca el origen del formulario para que la Server Action decida si redirige o no al terminar. */
  origen?: string;
  // Cuando se pasa (uso en Caja): reemplaza el <select miembroId> por un
  // botón "Seleccionar miembro" que abre un modal de búsqueda (nombre o
  // cédula, ≥3 caracteres) — igual criterio que /miembros. Al elegir un
  // miembro, el plan y el monto se fijan automáticamente según su plan
  // vigente (no se elige plan ni se tipea monto acá; el cambio de plan es
  // exclusivo de /miembros, ver diseño acordado).
  miembrosConPlan?: Miembro[];
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

  const [planId, setPlanId] = useState("");
  const [monto, setMonto] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [miembroElegido, setMiembroElegido] = useState<MiembroConPlan | null>(null);
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });

  // El planFijo efectivo: el que llega por prop (ficha del miembro), o —
  // en Caja — el del plan vigente del miembro elegido en el modal.
  const planFijoEfectivo: PlanFijo | undefined =
    planFijo ??
    (miembroElegido?.plan
      ? {
          id: miembroElegido.plan.id,
          nombre: miembroElegido.plan.nombre,
          precioUSD: miembroElegido.plan.precioUSD,
          multisede: miembroElegido.plan.multisede,
        }
      : undefined);

  const montoNumero = planFijoEfectivo ? planFijoEfectivo.precioUSD : Number(monto) || 0;

  function manejarCambioPlan(id: string) {
    setPlanId(id);
    const plan = planes.find((p) => p.id === id);
    if (plan) setMonto(String(plan.precioUSD));
  }

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

      {origen && <input type="hidden" name="origen" value={origen} />}

      {miembroIdFijo ? (
        <input type="hidden" name="miembroId" value={miembroIdFijo} />
      ) : miembrosConPlan ? (
        <div className="flex flex-col gap-1.5 text-sm">
          <span style={{ color: "var(--gx-muted)" }}>Miembro</span>
          {miembroElegido ? (
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="flex items-center justify-between rounded-lg border-2 p-3 text-left transition-colors duration-150"
              style={{ borderColor: "var(--gx-accent)" }}
            >
              <span>
                <span className="block font-medium" style={{ color: "var(--gx-ink)" }}>
                  {miembroElegido.nombre}
                </span>
                <span className="block text-xs" style={{ color: "var(--gx-muted)" }}>
                  {miembroElegido.cedula}
                </span>
              </span>
              <span className="text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                Cambiar
              </span>
            </button>
          ) : (
            <Button type="button" variant="secundario" onClick={() => setModalAbierto(true)}>
              Seleccionar miembro
            </Button>
          )}
          <input type="hidden" name="miembroId" value={miembroElegido?.id ?? ""} />
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Miembro
          <select
            name="miembroId"
            required
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="">Seleccioná un miembro</option>
            {miembros.map((miembro) => (
              <option key={miembro.id} value={miembro.id}>
                {miembro.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {modalAbierto && miembrosConPlan && (
        <SelectorMiembroModal
          miembros={miembrosConPlan}
          planes={planes}
          onSeleccionar={(miembro) => {
            setMiembroElegido(miembro);
            setModalAbierto(false);
          }}
          onCerrar={() => setModalAbierto(false)}
        />
      )}

      {planFijoEfectivo ? (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {planFijoEfectivo.nombre}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Monto</span>
            <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              ${planFijoEfectivo.precioUSD.toFixed(2)}
            </span>
          </div>
          <input type="hidden" name="planId" value={planFijoEfectivo.id} />
          <input type="hidden" name="monto" value={planFijoEfectivo.precioUSD} />
        </div>
      ) : miembrosConPlan ? (
        !miembroElegido && (
          <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
            Elegí un miembro para ver su plan y monto a cobrar.
          </p>
        )
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Plan
            <select
              name="planId"
              required
              value={planId}
              onChange={(e) => manejarCambioPlan(e.target.value)}
              className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              <option value="">Seleccioná un plan</option>
              {planes.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.nombre}
                </option>
              ))}
            </select>
          </label>

          <CurrencyInput
            name="monto"
            label="Monto"
            moneda="USD"
            required
            value={monto}
            onChange={(valor) => setMonto(valor)}
          />
        </>
      )}

      <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
      <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
      <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
      <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />

      <SelectorMetodoPago
        metodos={metodosPago}
        monto={montoNumero}
        onCambio={setSeleccionMetodo}
      />

      <Button type="submit" disabled={enviando || !seleccionMetodo.metodoPagoId}>
        {enviando ? "Registrando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
