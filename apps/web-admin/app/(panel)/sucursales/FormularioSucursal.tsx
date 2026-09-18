"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioSucursal } from "./actions";

export interface ValoresFormularioSucursal {
  nombre: string;
  direccion: string | null;
  diasGracia: number;
  apiKey?: string;
}

export function FormularioSucursal({
  accion,
  valoresIniciales,
  puedeGuardar = true,
}: {
  accion: (estado: EstadoFormularioSucursal, formData: FormData) => Promise<EstadoFormularioSucursal>;
  valoresIniciales?: ValoresFormularioSucursal;
  /** Sin permiso SUCURSALES/EDITAR el formulario se muestra en solo lectura. */
  puedeGuardar?: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [copiado, setCopiado] = useState(false);

  async function copiarApiKey() {
    if (!valoresIniciales?.apiKey) return;
    await navigator.clipboard.writeText(valoresIniciales.apiKey);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <Input
        name="nombre"
        label="Nombre"
        required
        defaultValue={valoresIniciales?.nombre}
        readOnly={!puedeGuardar}
      />
      <Input
        name="direccion"
        label="Dirección"
        defaultValue={valoresIniciales?.direccion ?? ""}
        readOnly={!puedeGuardar}
      />
      <Input
        name="diasGracia"
        label="Días de gracia"
        type="number"
        required
        defaultValue={valoresIniciales?.diasGracia ?? 0}
        readOnly={!puedeGuardar}
      />

      {valoresIniciales?.apiKey && (
        <div className="flex flex-col gap-1 text-sm text-neutral-700">
          API Key del kiosco
          <div className="flex gap-2">
            <input
              readOnly
              value={valoresIniciales.apiKey}
              className="flex-1 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-500"
            />
            <Button type="button" onClick={copiarApiKey}>
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      {puedeGuardar && (
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando..." : "Guardar"}
        </Button>
      )}
    </form>
  );
}
