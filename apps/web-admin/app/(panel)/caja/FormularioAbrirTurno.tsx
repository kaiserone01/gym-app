"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoAbrirTurno } from "./actions";

export function FormularioAbrirTurno({
  accion,
  requiereSucursal,
  sucursales,
}: {
  accion: (estado: EstadoAbrirTurno, formData: FormData) => Promise<EstadoAbrirTurno>;
  requiereSucursal: boolean;
  sucursales: Array<{ id: string; nombre: string }>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex max-w-md flex-col gap-4 rounded-xl border border-neutral-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Abrir turno</h2>

      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      {requiereSucursal && (
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Sucursal
          <select name="sucursalId" required className="rounded border border-neutral-300 px-3 py-2">
            <option value="">Seleccioná una sucursal</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <Input name="fondoInicialUSD" label="Fondo inicial (USD)" type="number" step="0.01" required defaultValue="0" />
      <Input name="fondoInicialBs" label="Fondo inicial (Bs)" type="number" step="0.01" required defaultValue="0" />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Abriendo..." : "Abrir turno"}
      </Button>
    </form>
  );
}
