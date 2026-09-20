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
      {estado.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {estado.error}
        </p>
      )}

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
        <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
          API Key del kiosco
          <div className="flex gap-2">
            <input
              readOnly
              value={valoresIniciales.apiKey}
              className="min-h-11 flex-1 rounded-lg border px-3"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}
            />
            <Button type="button" variant="secundario" onClick={copiarApiKey}>
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
