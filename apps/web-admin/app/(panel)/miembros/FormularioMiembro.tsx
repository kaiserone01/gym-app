"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioMiembro } from "./actions";
import { PRESETS_PLAN_MIEMBRO } from "./planesPreset";

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

  const [presetKey, setPresetKey] = useState<string>(() => {
    if (!valoresIniciales) return "mensual_sin";
    const coincide = PRESETS_PLAN_MIEMBRO.find(
      (preset) => preset.planTipo === valoresIniciales.planTipo && preset.precio === valoresIniciales.precioPlan
    );
    return coincide?.key ?? "personalizado";
  });

  const presetSeleccionado = PRESETS_PLAN_MIEMBRO.find((preset) => preset.key === presetKey);
  const planTipoActual = presetSeleccionado?.planTipo ?? valoresIniciales?.planTipo ?? "SIN_ENTRENADOR";
  const precioActual = presetSeleccionado?.precio ?? valoresIniciales?.precioPlan ?? 0;

  return (
    <form action={enviar} className="flex flex-col gap-6">
      {estado.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
      )}

      <input type="hidden" name="planTipo" value={planTipoActual} />
      <input type="hidden" name="precioPlan" value={precioActual} />

      <section className="rounded-xl border border-neutral-200 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Datos personales
        </h2>

        <div className="flex flex-col gap-4">
          <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />

          <div className="grid grid-cols-2 gap-4">
            <Input
              name="cedula"
              label="Cédula"
              required
              disabled={esEdicion}
              defaultValue={valoresIniciales?.cedula}
            />
            <Input name="celular" label="Celular" defaultValue={valoresIniciales?.celular} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Plan de membresía
        </h2>

        {presetKey === "personalizado" && (
          <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Este miembro tiene un precio personalizado (${precioActual.toFixed(2)}) que no coincide con
            ningún plan de la lista. Elegí uno de abajo solo si querés cambiarlo.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {PRESETS_PLAN_MIEMBRO.map((preset) => {
            const seleccionado = presetKey === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => setPresetKey(preset.key)}
                className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                  seleccionado
                    ? "border-blue-600 bg-blue-50"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <span className="text-sm font-medium text-neutral-700">{preset.nombre}</span>
                <span className="text-2xl font-semibold text-neutral-900">
                  ${preset.precio}
                  <span className="text-sm font-normal text-neutral-500">/mes</span>
                </span>
                {preset.planTipo === "CON_ENTRENADOR" && (
                  <span className="text-xs font-medium text-blue-600">Incluye entrenador</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
