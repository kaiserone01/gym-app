"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioPlan } from "./actions";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface ValoresFormularioPlan {
  nombre: string;
  frecuencia: FrecuenciaPago;
  incluyeEntrenador: boolean;
  precioUSD: number;
  multisede: boolean;
}

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export function FormularioPlan({
  accion,
  valoresIniciales,
  // Solo se pasa en edición: habilita el bloque de "cambiar frecuencia/
  // entrenador" con su modal de doble alerta (solo SOCIO).
  cambioFrecuencia,
}: {
  accion: (estado: EstadoFormularioPlan, formData: FormData) => Promise<EstadoFormularioPlan>;
  valoresIniciales?: ValoresFormularioPlan;
  cambioFrecuencia?: {
    accion: (estado: EstadoFormularioPlan, formData: FormData) => Promise<EstadoFormularioPlan>;
    puedeEditar: boolean;
    cantidadSuscripcionesActivas: number;
  };
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;

  return (
    <>
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

        {!esEdicion && (
          <>
            <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
              Frecuencia de pago
              <select
                name="frecuencia"
                required
                defaultValue="MENSUAL"
                className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
              >
                <option value="SEMANAL">Semanal</option>
                <option value="QUINCENAL">Quincenal</option>
                <option value="MENSUAL">Mensual</option>
              </select>
            </label>

            <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
              <input type="checkbox" name="incluyeEntrenador" className="h-5 w-5 accent-[var(--gx-accent)]" />
              Incluye entrenador personal
            </label>
          </>
        )}

        <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
          <input
            type="checkbox"
            name="multisede"
            defaultChecked={valoresIniciales?.multisede}
            className="h-5 w-5 accent-[var(--gx-accent)]"
          />
          Multisede (permite asignar &quot;Ambas&quot; sedes a un miembro con este plan)
        </label>

        {esEdicion && (
          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
            <div className="flex justify-between">
              <span style={{ color: "var(--gx-muted)" }}>Frecuencia</span>
              <span style={{ color: "var(--gx-ink)" }}>{ETIQUETA_FRECUENCIA[valoresIniciales.frecuencia]}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span style={{ color: "var(--gx-muted)" }}>Entrenador</span>
              <span style={{ color: "var(--gx-ink)" }}>
                {valoresIniciales.incluyeEntrenador ? "Incluido" : "No incluido"}
              </span>
            </div>
          </div>
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

      {esEdicion && cambioFrecuencia?.puedeEditar && (
        <CambiarFrecuenciaSection
          nombrePlan={valoresIniciales.nombre}
          frecuenciaActual={valoresIniciales.frecuencia}
          incluyeEntrenadorActual={valoresIniciales.incluyeEntrenador}
          cantidadSuscripcionesActivas={cambioFrecuencia.cantidadSuscripcionesActivas}
          accion={cambioFrecuencia.accion}
        />
      )}
    </>
  );
}

function CambiarFrecuenciaSection({
  nombrePlan,
  frecuenciaActual,
  incluyeEntrenadorActual,
  cantidadSuscripcionesActivas,
  accion,
}: {
  nombrePlan: string;
  frecuenciaActual: FrecuenciaPago;
  incluyeEntrenadorActual: boolean;
  cantidadSuscripcionesActivas: number;
  accion: (estado: EstadoFormularioPlan, formData: FormData) => Promise<EstadoFormularioPlan>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const [abierto, setAbierto] = useState(false);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>(frecuenciaActual);
  const [incluyeEntrenador, setIncluyeEntrenador] = useState(incluyeEntrenadorActual);
  const [exonerar, setExonerar] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");

  const hayCambios = frecuencia !== frecuenciaActual || incluyeEntrenador !== incluyeEntrenadorActual;
  const confirmacionValida = confirmacion.trim() === nombrePlan;

  return (
    <div className="mt-8 rounded-lg border-2 p-4" style={{ borderColor: "var(--gx-bad)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
        Zona de riesgo: cambiar frecuencia o entrenador
      </h3>
      <p className="mt-1 text-xs" style={{ color: "var(--gx-muted)" }}>
        Solo el socio puede hacer este cambio. Afecta a todos los miembros con este plan.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Nueva frecuencia
          <select
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value as FrecuenciaPago)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="SEMANAL">Semanal</option>
            <option value="QUINCENAL">Quincenal</option>
            <option value="MENSUAL">Mensual</option>
          </select>
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
          <input
            type="checkbox"
            checked={incluyeEntrenador}
            onChange={(e) => setIncluyeEntrenador(e.target.checked)}
            className="h-5 w-5 accent-[var(--gx-accent)]"
          />
          Incluye entrenador personal
        </label>

        <Button type="button" variant="peligro" disabled={!hayCambios} onClick={() => setAbierto(true)}>
          Cambiar frecuencia / entrenador
        </Button>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 p-6"
            style={{ borderColor: "var(--gx-bad)", background: "var(--gx-surface)" }}
          >
            <h3 className="text-lg font-bold" style={{ color: "var(--gx-bad)" }}>
              ⚠️ Esta acción afecta a {cantidadSuscripcionesActivas}{" "}
              {cantidadSuscripcionesActivas === 1 ? "miembro" : "miembros"}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--gx-muted)" }}>
              Vas a cambiar la frecuencia y/o el entrenador del plan <strong>{nombrePlan}</strong>. Esto{" "}
              {exonerar
                ? "NO recalculará ningún vencimiento — las suscripciones activas quedan exactamente como están."
                : `recalculará el vencimiento de las ${cantidadSuscripcionesActivas} suscripciones activas vigentes de este plan (prorrateado a la nueva frecuencia, sin cobrar nada extra).`}
            </p>

            {estado.error && (
              <p
                className="mt-3 rounded-lg px-3 py-2 text-sm"
                style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
              >
                {estado.error}
              </p>
            )}

            <form action={enviar} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="frecuencia" value={frecuencia} />
              <input type="hidden" name="incluyeEntrenador" value={incluyeEntrenador ? "1" : ""} />
              <input type="hidden" name="exonerar" value={exonerar ? "1" : ""} />

              <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
                <input
                  type="checkbox"
                  checked={exonerar}
                  onChange={(e) => setExonerar(e.target.checked)}
                  className="h-5 w-5 accent-[var(--gx-accent)]"
                />
                Exonerar: no recalcular las suscripciones activas
              </label>

              <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
                Escribí <strong>{nombrePlan}</strong> para confirmar
                <input
                  name="confirmacion"
                  required
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                />
              </label>

              <div className="mt-2 flex gap-3">
                <Button type="button" variant="secundario" className="flex-1" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="peligro"
                  className="flex-1"
                  disabled={!confirmacionValida || enviando}
                >
                  {enviando ? "Aplicando..." : "Confirmar cambio"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
