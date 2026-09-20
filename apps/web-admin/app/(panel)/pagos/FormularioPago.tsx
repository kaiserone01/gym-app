"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPago } from "./actions";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { SelectorMetodoPago } from "./SelectorMetodoPago";

export interface MiembroParaSelector {
  id: string;
  nombre: string;
}

export interface PlanParaSelector {
  id: string;
  nombre: string;
  precioUSD: number;
}

export function FormularioPago({
  accion,
  miembros,
  planes,
  metodosPago,
  miembroIdFijo,
  origen,
}: {
  accion: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  miembros: MiembroParaSelector[];
  planes: PlanParaSelector[];
  metodosPago: MetodoPago[];
  miembroIdFijo?: string;
  /** Marca el origen del formulario para que la Server Action decida si redirige o no al terminar. */
  origen?: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [planId, setPlanId] = useState("");
  const [monto, setMonto] = useState("");
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });

  const montoNumero = Number(monto) || 0;

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

      <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
      <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
      <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
      <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />

      <SelectorMetodoPago metodos={metodosPago} monto={montoNumero} onCambio={setSeleccionMetodo} />

      <Button type="submit" disabled={enviando || !seleccionMetodo.metodoPagoId}>
        {enviando ? "Registrando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
