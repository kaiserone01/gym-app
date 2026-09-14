"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioMiembro } from "./actions";
import { PRESETS_PLAN_MIEMBRO } from "./planesPreset";

export interface ValoresFormularioMiembro {
  nombre: string;
  cedula: string;
  celular: string;
  fechaInscripcion: string; // yyyy-mm-dd
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  precioPlan: number;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatearFecha(fechaISO: string): string {
  if (!fechaISO) return "—";
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{valor}</dd>
    </div>
  );
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
  const formRef = useRef<HTMLFormElement>(null);

  const [nombre, setNombre] = useState(valoresIniciales?.nombre ?? "");
  const [cedula, setCedula] = useState(valoresIniciales?.cedula ?? "");
  const [celular, setCelular] = useState(valoresIniciales?.celular ?? "");
  const [fechaInscripcion, setFechaInscripcion] = useState(valoresIniciales?.fechaInscripcion ?? hoyISO());

  const [presetKey, setPresetKey] = useState<string>(() => {
    if (!valoresIniciales) return "mensual_sin";
    const coincide = PRESETS_PLAN_MIEMBRO.find(
      (preset) => preset.planTipo === valoresIniciales.planTipo && preset.precio === valoresIniciales.precioPlan
    );
    return coincide?.key ?? "personalizado";
  });
  const [precioPersonalizado, setPrecioPersonalizado] = useState<string>(
    presetKey === "personalizado" ? String(valoresIniciales?.precioPlan ?? "") : ""
  );
  const [entrenadorPersonalizado, setEntrenadorPersonalizado] = useState(
    valoresIniciales?.planTipo === "CON_ENTRENADOR"
  );
  const [errorPrecioPersonalizado, setErrorPrecioPersonalizado] = useState<string | null>(null);
  const [mostrarTicket, setMostrarTicket] = useState(false);

  const esCustom = presetKey === "personalizado";
  const presetSeleccionado = PRESETS_PLAN_MIEMBRO.find((preset) => preset.key === presetKey);

  const planTipoActual: "SIN_ENTRENADOR" | "CON_ENTRENADOR" = esCustom
    ? entrenadorPersonalizado
      ? "CON_ENTRENADOR"
      : "SIN_ENTRENADOR"
    : (presetSeleccionado?.planTipo ?? "SIN_ENTRENADOR");

  const precioActual = esCustom ? Number(precioPersonalizado) || 0 : (presetSeleccionado?.precio ?? 0);
  const nombrePlanActual = esCustom ? "Personalizado" : (presetSeleccionado?.nombre ?? "—");

  function manejarClickGuardar() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;

    if (esCustom && (!precioPersonalizado || Number(precioPersonalizado) <= 0)) {
      setErrorPrecioPersonalizado("Ingresá un precio válido.");
      return;
    }

    setErrorPrecioPersonalizado(null);
    setMostrarTicket(true);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <form ref={formRef} action={enviar} className="flex flex-col gap-6">
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
            <Input
              name="nombre"
              label="Nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                name="cedula"
                label="Cédula"
                required
                disabled={esEdicion}
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
              />
              <Input
                name="celular"
                label="Celular"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
              />
            </div>

            <Input
              name="fechaInscripcion"
              label="Fecha de inscripción"
              type="date"
              required
              value={fechaInscripcion}
              onChange={(e) => setFechaInscripcion(e.target.value)}
            />
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Plan de membresía
          </h2>

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

            <button
              type="button"
              onClick={() => setPresetKey("personalizado")}
              className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                esCustom ? "border-blue-600 bg-blue-50" : "border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <span className="text-sm font-medium text-neutral-700">Personalizado</span>
              <span className="text-lg font-semibold text-neutral-900">Definir precio</span>
              <span className="text-xs text-neutral-500">Para casos especiales</span>
            </button>
          </div>

          {esCustom && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
              <Input
                label="Precio personalizado (USD)"
                type="number"
                step="0.01"
                min="0"
                value={precioPersonalizado}
                onChange={(e) => {
                  setPrecioPersonalizado(e.target.value);
                  setErrorPrecioPersonalizado(null);
                }}
              />
              {errorPrecioPersonalizado && (
                <p className="text-sm text-red-700">{errorPrecioPersonalizado}</p>
              )}

              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={entrenadorPersonalizado}
                  onChange={(e) => setEntrenadorPersonalizado(e.target.checked)}
                />
                Incluye entrenador personal
              </label>
            </div>
          )}
        </section>

        <Button type="button" onClick={manejarClickGuardar} disabled={enviando}>
          Guardar
        </Button>
      </form>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        {!mostrarTicket ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            <p>Completá el formulario y hacé clic en</p>
            <p>&quot;Guardar&quot; para ver el resumen acá.</p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-5">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {esEdicion ? "Resumen de la edición" : "Resumen del nuevo miembro"}
            </p>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <dl className="flex flex-col gap-2 text-sm">
              <Fila label="Nombre" valor={nombre || "—"} />
              <Fila label="Cédula" valor={cedula || "—"} />
              <Fila label="Celular" valor={celular || "—"} />
              <Fila label="Inscripción" valor={formatearFecha(fechaInscripcion)} />
              <Fila label="Plan" valor={nombrePlanActual} />
              <Fila label="Entrenador" valor={planTipoActual === "CON_ENTRENADOR" ? "Sí" : "No"} />
            </dl>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-neutral-700">Total</span>
              <span className="text-2xl font-bold text-neutral-900">${precioActual.toFixed(2)}</span>
            </div>

            <p className="mt-5 text-center text-sm font-medium text-neutral-700">
              ¿Está seguro de la información suministrada?
            </p>

            <div className="mt-3 flex gap-3">
              <Button
                type="button"
                variant="secundario"
                className="flex-1"
                onClick={() => setMostrarTicket(false)}
              >
                No, editar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={enviando}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {enviando ? "Guardando..." : "Sí, guardar"}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
