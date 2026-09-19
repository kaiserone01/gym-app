"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPago } from "./actions";
import { METODOS_PAGO, METODOS_BANCARIOS } from "../metodosPago";
import { TASA_BCV_FIJA, METODOS_EN_BS, formatearBs } from "../tasaBcvFija";

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
  miembroIdFijo,
  origen,
}: {
  accion: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  miembros: MiembroParaSelector[];
  planes: PlanParaSelector[];
  miembroIdFijo?: string;
  /** Marca el origen del formulario para que la Server Action decida si redirige o no al terminar. */
  origen?: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [planId, setPlanId] = useState("");
  const [metodo, setMetodo] = useState("");
  const [monto, setMonto] = useState("");

  const esPagoEnBs = METODOS_EN_BS.includes(metodo);
  const montoNumero = Number(monto);
  const montoBs = esPagoEnBs && !Number.isNaN(montoNumero) ? montoNumero * TASA_BCV_FIJA : null;

  function manejarCambioPlan(id: string) {
    setPlanId(id);
    const plan = planes.find((p) => p.id === id);
    if (plan) setMonto(String(plan.precioUSD));
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

      {origen && <input type="hidden" name="origen" value={origen} />}

      {miembroIdFijo ? (
        <input type="hidden" name="miembroId" value={miembroIdFijo} />
      ) : (
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Miembro
          <select name="miembroId" required className="rounded border border-neutral-300 px-3 py-2">
            <option value="">Seleccioná un miembro</option>
            {miembros.map((miembro) => (
              <option key={miembro.id} value={miembro.id}>
                {miembro.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Plan
        <select
          name="planId"
          required
          value={planId}
          onChange={(e) => manejarCambioPlan(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        >
          <option value="">Seleccioná un plan</option>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Método de pago
        <select
          name="metodo"
          required
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        >
          <option value="">Seleccioná un método</option>
          {METODOS_PAGO.map((metodoPago) => (
            <option key={metodoPago.value} value={metodoPago.value}>
              {metodoPago.label}
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

      {esPagoEnBs && (
        <>
          <input type="hidden" name="tasaCambio" value={TASA_BCV_FIJA} />
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Tasa BCV (fija, prueba)</span>
              <span className="font-medium text-neutral-900">Bs. {TASA_BCV_FIJA}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-neutral-500">Monto en bolívares</span>
              <span className="font-semibold text-neutral-900">
                {montoBs !== null ? `Bs. ${formatearBs(montoBs)}` : "—"}
              </span>
            </div>
          </div>
        </>
      )}

      {METODOS_BANCARIOS.includes(metodo) && (
        <Input
          name="numeroOperacion"
          label="Número de operación (últimos 4 dígitos)"
          required
          maxLength={4}
          pattern="[0-9]{4}"
        />
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Registrando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
