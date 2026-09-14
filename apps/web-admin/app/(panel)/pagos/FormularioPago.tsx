"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPago } from "./actions";

export interface MiembroParaSelector {
  id: string;
  nombre: string;
}

export interface PlanParaSelector {
  id: string;
  nombre: string;
}

const METODOS_PAGO: Array<{ value: string; label: string }> = [
  { value: "efectivo_usd", label: "Efectivo (USD)" },
  { value: "efectivo_bs", label: "Efectivo (Bs)" },
  { value: "transferencia", label: "Transferencia" },
  { value: "zelle", label: "Zelle" },
  { value: "binance_usdt", label: "Binance / USDT" },
  { value: "pago_movil", label: "Pago móvil" },
];

export function FormularioPago({
  accion,
  miembros,
  planes,
  miembroIdFijo,
}: {
  accion: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  miembros: MiembroParaSelector[];
  planes: PlanParaSelector[];
  miembroIdFijo?: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

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
        <select name="planId" required className="rounded border border-neutral-300 px-3 py-2">
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
        <select name="metodo" required className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Seleccioná un método</option>
          {METODOS_PAGO.map((metodo) => (
            <option key={metodo.value} value={metodo.value}>
              {metodo.label}
            </option>
          ))}
        </select>
      </label>

      <Input name="monto" label="Monto (USD)" type="number" step="0.01" required />

      <Input name="tasaCambio" label="Tasa de cambio (opcional, si el pago fue en Bs)" type="number" step="0.0001" />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Registrando..." : "Registrar pago"}
      </Button>
    </form>
  );
}
