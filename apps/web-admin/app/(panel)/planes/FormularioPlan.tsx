"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPlan } from "./actions";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export interface ValoresFormularioPlan {
  nombre: string;
  tipoAcceso: "SEDE_UNICA" | "LISTA_CERRADA" | "TODA_LA_ORGANIZACION";
  precioUSD: number;
  sucursalesAsignadas: SucursalResumen[];
}

export function FormularioPlan({
  accion,
  sucursales,
  valoresIniciales,
}: {
  accion: (estado: EstadoFormularioPlan, formData: FormData) => Promise<EstadoFormularioPlan>;
  sucursales: SucursalResumen[];
  valoresIniciales?: ValoresFormularioPlan;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;
  const [tipoAcceso, setTipoAcceso] = useState(valoresIniciales?.tipoAcceso ?? "TODA_LA_ORGANIZACION");
  const idsAsignados = new Set(valoresIniciales?.sucursalesAsignadas.map((s) => s.id) ?? []);

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

      <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Tipo de acceso
        <select
          name="tipoAcceso"
          disabled={esEdicion}
          value={tipoAcceso}
          onChange={(e) => setTipoAcceso(e.target.value as typeof tipoAcceso)}
          className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)] disabled:opacity-50"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        >
          <option value="TODA_LA_ORGANIZACION">Toda la organización</option>
          <option value="SEDE_UNICA">Sede única</option>
          <option value="LISTA_CERRADA">Lista cerrada de sedes</option>
        </select>
      </label>

      {tipoAcceso !== "TODA_LA_ORGANIZACION" && (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--gx-edge)" }}>
          <legend className="px-1 text-sm" style={{ color: "var(--gx-muted)" }}>
            Sucursales con acceso
          </legend>
          {sucursales.length === 0 && (
            <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
              No hay sucursales creadas todavía.
            </p>
          )}
          {sucursales.map((sucursal) => (
            <label
              key={sucursal.id}
              className="flex min-h-11 items-center gap-2 text-sm"
              style={{ color: "var(--gx-muted)" }}
            >
              <input
                type="checkbox"
                name="sucursalIds"
                value={sucursal.id}
                disabled={esEdicion}
                defaultChecked={idsAsignados.has(sucursal.id)}
                className="h-5 w-5 accent-[var(--gx-accent)]"
              />
              {sucursal.nombre}
            </label>
          ))}
        </fieldset>
      )}

      <Input
        name="precioUSD"
        label="Precio (USD)"
        type="number"
        step="0.01"
        required
        defaultValue={valoresIniciales?.precioUSD}
      />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
