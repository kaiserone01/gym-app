"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoRegistrarEgreso } from "./actions";

const METODOS_EGRESO = [
  { value: "efectivo_usd", label: "Efectivo (USD)", moneda: "USD" as const },
  { value: "efectivo_bs", label: "Efectivo (Bs)", moneda: "BS" as const },
];

export function FormularioEgreso({
  accion,
  turnoId,
}: {
  accion: (estado: EstadoRegistrarEgreso, formData: FormData) => Promise<EstadoRegistrarEgreso>;
  turnoId: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [metodo, setMetodo] = useState(METODOS_EGRESO[0].value);
  const moneda = METODOS_EGRESO.find((m) => m.value === metodo)?.moneda ?? "USD";

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Registrar egreso</h3>

      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <input type="hidden" name="turnoId" value={turnoId} />
      <input type="hidden" name="moneda" value={moneda} />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Método
        <select
          name="metodo"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        >
          {METODOS_EGRESO.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <Input name="monto" label={`Monto (${moneda})`} type="number" step="0.01" required />
      <Input name="motivo" label="Motivo" required />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Registrando..." : "Registrar egreso"}
      </Button>
    </form>
  );
}
