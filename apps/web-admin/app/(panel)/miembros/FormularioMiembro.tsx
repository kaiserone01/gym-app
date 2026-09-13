"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioMiembro } from "./actions";

export interface ValoresFormularioMiembro {
  nombre: string;
  cedula: string;
  celular: string;
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  precioPlan: number;
}

export function FormularioMiembro({
  accion,
  valoresIniciales,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  valoresIniciales?: ValoresFormularioMiembro;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

      <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />

      <Input
        name="cedula"
        label="Cédula"
        required
        disabled={esEdicion}
        defaultValue={valoresIniciales?.cedula}
      />

      <Input name="celular" label="Celular" defaultValue={valoresIniciales?.celular} />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Plan
        <select
          name="planTipo"
          defaultValue={valoresIniciales?.planTipo ?? "SIN_ENTRENADOR"}
          className="rounded border border-neutral-300 px-3 py-2"
        >
          <option value="SIN_ENTRENADOR">Sin entrenador</option>
          <option value="CON_ENTRENADOR">Con entrenador</option>
        </select>
      </label>

      <Input
        name="precioPlan"
        label="Precio del plan (USD)"
        type="number"
        step="0.01"
        required
        defaultValue={valoresIniciales?.precioPlan}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
