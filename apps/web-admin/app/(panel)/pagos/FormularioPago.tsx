"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoFormularioPago } from "./actions";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import { SelectorMetodoPago } from "./SelectorMetodoPago";

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
  sucursalesVisibles,
  sucursalesOrganizacion,
  sucursalIdDefault,
  miembroIdFijo,
  planFijo,
  origen,
}: {
  accion: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  miembros: MiembroParaSelector[];
  planes: PlanParaSelector[];
  metodosPago: MetodoPago[];
  // Ver SelectorMetodoPago — determinan el selector "Sede del pago".
  sucursalesVisibles: SucursalResumen[];
  sucursalesOrganizacion: SucursalResumen[];
  sucursalIdDefault: string | null;
  miembroIdFijo?: string;
  // Cuando se pasa, el pago se registra directo contra este plan (el
  // vigente en la ficha del miembro) sin selector — ver diseño acordado:
  // "el valor de esa membresía es lo que se toma en cuenta".
  planFijo?: PlanFijo;
  /** Marca el origen del formulario para que la Server Action decida si redirige o no al terminar. */
  origen?: string;
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
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
    sucursalId: string | null;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "", sucursalId: sucursalIdDefault ?? null });

  const montoNumero = planFijo ? planFijo.precioUSD : Number(monto) || 0;
  const planEsMultisede = planFijo ? planFijo.multisede : (planes.find((p) => p.id === planId)?.multisede ?? false);

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

      {planFijo ? (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {planFijo.nombre}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Monto</span>
            <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              ${planFijo.precioUSD.toFixed(2)}
            </span>
          </div>
          <input type="hidden" name="planId" value={planFijo.id} />
          <input type="hidden" name="monto" value={planFijo.precioUSD} />
        </div>
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

          <Input
            name="monto"
            label="Monto (USD)"
            type="number"
            step="0.01"
            required
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </>
      )}

      <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
      <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
      <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
      <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />
      <input type="hidden" name="sucursalIdPago" value={seleccionMetodo.sucursalId ?? ""} />

      <SelectorMetodoPago
        metodos={metodosPago}
        monto={montoNumero}
        onCambio={setSeleccionMetodo}
        sucursalesVisibles={sucursalesVisibles}
        sucursalesOrganizacion={sucursalesOrganizacion}
        sucursalIdDefault={sucursalIdDefault}
        planEsMultisede={planEsMultisede}
      />

      <Button type="submit" disabled={enviando || !seleccionMetodo.metodoPagoId}>
        {enviando ? "Registrando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
