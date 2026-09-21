"use client";

import { useActionState, useEffect, useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback, DURACION_MS } from "@gym-app/ui/components/FeedbackOverlay";
import { BuscadorMiembro, type MiembroConPlan, type PlanParaModal } from "./SelectorMiembroModal";
import { calcularProyeccionRenovacion } from "./proyeccionRenovacion";
import { DiasDisponibles } from "../miembros/vencimiento";
import { formatearBs } from "../tasaBcvFija";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { registrarPagoAction } from "../pagos/actions";

type Paso = 1 | 2 | 3 | 4;

const TITULOS_PASO: Record<Paso, string> = {
  1: "Elegí un miembro",
  2: "Estado de la membresía",
  3: "Método de pago",
  4: "Pago registrado",
};

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
};

function formatearFechaCorta(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function Avatar({ fotoUrl, nombre }: { fotoUrl: string | null; nombre: string }) {
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold"
      style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de miembro servida desde R2, dominio externo
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        iniciales(nombre || "?")
      )}
    </div>
  );
}

function BarraProgreso({ paso }: { paso: Paso }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {([1, 2, 3, 4] as Paso[]).map((n) => (
        <div key={n} className="flex flex-1 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={
              n <= paso
                ? { background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                : { background: "var(--gx-surface-2)", color: "var(--gx-muted)" }
            }
          >
            {n}
          </div>
          {n < 4 && (
            <div
              className="h-0.5 flex-1"
              style={{ background: n < paso ? "var(--gx-accent)" : "var(--gx-edge)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ContenidoPaso1({
  miembros,
  planes,
  onSeleccionar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  onSeleccionar: (miembro: MiembroConPlan) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BuscadorMiembro miembros={miembros} planes={planes} onSeleccionar={onSeleccionar} />
    </div>
  );
}

function ContenidoPaso2({
  miembro,
  planes,
  planElegidoId,
  onElegirPlan,
  tasaActual,
  onVolver,
  onContinuar,
}: {
  miembro: MiembroConPlan;
  planes: PlanParaModal[];
  planElegidoId: string | null;
  onElegirPlan: (id: string) => void;
  tasaActual: number | null;
  onVolver: () => void;
  onContinuar: (plan: PlanParaModal) => void;
}) {
  const planEfectivo = miembro.plan ?? planes.find((p) => p.id === planElegidoId);

  const proyeccion = planEfectivo
    ? calcularProyeccionRenovacion(miembro.fechaVencimiento, planEfectivo.frecuencia)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
            {miembro.nombre}
          </p>
          <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
            {miembro.cedula}
          </p>
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span style={{ color: "var(--gx-muted)" }}>Vencimiento</span>
        <DiasDisponibles fechaVencimiento={miembro.fechaVencimiento} />
      </div>

      {planEfectivo ? (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {planEfectivo.nombre}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Precio</span>
            <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              ${planEfectivo.precioUSD.toFixed(2)}/{ETIQUETA_FRECUENCIA[planEfectivo.frecuencia]}
              {tasaActual !== null && ` · Bs. ${formatearBs(planEfectivo.precioUSD * tasaActual)}`}
            </span>
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Este miembro no tiene un plan asignado — elegí uno para continuar
          <select
            value={planElegidoId ?? ""}
            onChange={(e) => onElegirPlan(e.target.value)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="">Seleccioná un plan</option>
            {planes.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre} — ${plan.precioUSD.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
      )}

      {proyeccion && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
          <p style={{ color: "var(--gx-ink)" }}>
            Al pagar la renovación, disfrutará de <strong>{proyeccion.diasDelPlan} días</strong>
            {proyeccion.adelantandoCuota && (
              <> ({proyeccion.diasTotalesTrasPago} días en total, incluyendo los días restantes)</>
            )}
            .
          </p>
          <p className="mt-1" style={{ color: "var(--gx-muted)" }}>
            Próximo vencimiento: {formatearFechaCorta(proyeccion.fechaProximoVencimiento)}
          </p>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Button type="button" variant="secundario" className="flex-1" onClick={onVolver}>
          Volver
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!planEfectivo}
          onClick={() => planEfectivo && onContinuar(planEfectivo)}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

function ContenidoPaso3({
  miembroId,
  planId,
  monto,
  metodosPago,
  onVolver,
  onPagoRegistrado,
}: {
  miembroId: string;
  planId: string;
  monto: number;
  metodosPago: MetodoPago[];
  onVolver: () => void;
  onPagoRegistrado: (fechaFinCicloISO: string | undefined) => void;
}) {
  const [estado, enviar, enviando] = useActionState(registrarPagoAction, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (!estado.ok) return;
    mostrarExito(estado.ok);
    const temporizador = setTimeout(() => onPagoRegistrado(estado.fechaFinCiclo), DURACION_MS);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a las funciones
  }, [estado.ok]);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="miembroId" value={miembroId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="monto" value={monto} />
      <input type="hidden" name="origen" value="caja" />
      <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
      <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
      <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
      <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />

      <SelectorMetodoPago metodos={metodosPago} monto={monto} onCambio={setSeleccionMetodo} />

      <div className="mt-2 flex gap-2">
        <Button type="button" variant="secundario" className="flex-1" onClick={onVolver} disabled={enviando}>
          Volver
        </Button>
        <Button type="submit" className="flex-1" disabled={enviando || !seleccionMetodo.metodoPagoId}>
          {enviando ? "Registrando..." : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}

function ContenidoPaso4({
  miembro,
  planNombre,
  fechaFinCiclo,
  onCerrar,
}: {
  miembro: MiembroConPlan;
  planNombre: string;
  fechaFinCiclo: Date | null;
  onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
            {miembro.nombre}
          </p>
          <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
            {miembro.cedula}
          </p>
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span style={{ color: "var(--gx-muted)" }}>Nuevo vencimiento</span>
        <DiasDisponibles fechaVencimiento={fechaFinCiclo} />
      </div>

      {fechaFinCiclo && (
        <p className="text-right text-sm" style={{ color: "var(--gx-muted)" }}>
          {formatearFechaCorta(fechaFinCiclo)}
        </p>
      )}

      <div className="flex justify-between text-sm">
        <span style={{ color: "var(--gx-muted)" }}>Plan</span>
        <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
          {planNombre}
        </span>
      </div>

      <Button type="button" className="mt-2" onClick={onCerrar}>
        Cerrar
      </Button>
    </div>
  );
}

export function ModalRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  onCerrar: () => void;
}) {
  const [paso, setPaso] = useState<Paso>(1);
  const [miembroElegido, setMiembroElegido] = useState<MiembroConPlan | null>(null);
  const [planElegidoId, setPlanElegidoId] = useState<string | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [fechaFinCicloFinal, setFechaFinCicloFinal] = useState<Date | null>(null);

  function pedirCierre() {
    if (paso === 1 || paso === 4) {
      onCerrar();
      return;
    }
    setConfirmandoCierre(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Registrar pago"
      onClick={pedirCierre}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            {TITULOS_PASO[paso]}
          </h3>
          <button
            type="button"
            onClick={pedirCierre}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-sm transition-colors duration-150 hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>

        <BarraProgreso paso={paso} />

        {confirmandoCierre && (
          <div
            className="mb-4 rounded-lg border-2 p-4"
            style={{ borderColor: "var(--gx-bad)", background: "var(--gx-surface-2)" }}
          >
            <p className="text-sm" style={{ color: "var(--gx-ink)" }}>
              ¿Descartar este pago en curso? Se perderá la selección hecha hasta ahora.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secundario"
                className="flex-1"
                onClick={() => setConfirmandoCierre(false)}
              >
                Seguir aquí
              </Button>
              <Button type="button" variant="peligro" className="flex-1" onClick={onCerrar}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {paso === 1 && (
          <ContenidoPaso1
            miembros={miembros}
            planes={planes}
            onSeleccionar={(m) => {
              setMiembroElegido(m);
              setPlanElegidoId(null);
              setPaso(2);
            }}
          />
        )}

        {paso === 2 && miembroElegido && (
          <ContenidoPaso2
            miembro={miembroElegido}
            planes={planes}
            planElegidoId={planElegidoId}
            onElegirPlan={setPlanElegidoId}
            tasaActual={tasaActual}
            onVolver={() => setPaso(1)}
            onContinuar={(plan) => {
              setPlanElegidoId(plan.id);
              setPaso(3);
            }}
          />
        )}

        {paso === 3 && miembroElegido && planElegidoId && (
          <ContenidoPaso3
            miembroId={miembroElegido.id}
            planId={planElegidoId}
            monto={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.precioUSD ?? 0
            }
            metodosPago={metodosPago}
            onVolver={() => setPaso(2)}
            onPagoRegistrado={(fechaFinCicloISO) => {
              setFechaFinCicloFinal(fechaFinCicloISO ? new Date(fechaFinCicloISO) : null);
              setPaso(4);
            }}
          />
        )}

        {paso === 4 && miembroElegido && (
          <ContenidoPaso4
            miembro={miembroElegido}
            planNombre={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.nombre ?? "—"
            }
            fechaFinCiclo={fechaFinCicloFinal}
            onCerrar={onCerrar}
          />
        )}
      </div>
    </div>
  );
}
