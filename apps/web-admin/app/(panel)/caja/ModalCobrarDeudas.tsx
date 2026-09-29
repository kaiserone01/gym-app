"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { totalDeudas } from "@gym-app/domain/entities/DeudaProducto";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { formatearBs } from "../tasaBcvFija";
import type { EstadoCobrarDeudas } from "./actions";

const ID_FORMULARIO = "formulario-cobrar-deudas";

interface Seleccion {
  metodoPagoId: string | null;
  metodo: string;
  tasaCambio: number | null;
  numeroOperacion: string;
  requiereNumeroOperacion: boolean;
}

const SELECCION_VACIA: Seleccion = {
  metodoPagoId: null,
  metodo: "",
  tasaCambio: null,
  numeroOperacion: "",
  requiereNumeroOperacion: false,
};

export function ModalCobrarDeudas({
  grupos,
  metodosPago,
  tasaActual,
  accionCobrar,
  accionAnular,
  onCerrar,
}: {
  grupos: GrupoDeudasMiembro[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  accionCobrar: (estado: EstadoCobrarDeudas, formData: FormData) => Promise<EstadoCobrarDeudas>;
  accionAnular: (id: string) => Promise<{ error?: string; ok?: string }>;
  onCerrar: () => void;
}) {
  const [estado, enviar, enviando] = useActionState(accionCobrar, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const [anulando, iniciarTransicion] = useTransition();
  const [miembroId, setMiembroId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>(SELECCION_VACIA);

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) {
      mostrarExito(estado.ok);
      onCerrar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito/onCerrar
  }, [estado.ok]);

  const grupo = grupos.find((g) => g.miembroId === miembroId) ?? null;
  const total = grupo ? totalDeudas(grupo.deudas) : 0;
  const numeroOperacionValido = !seleccion.requiereNumeroOperacion || /^\d{4}$/.test(seleccion.numeroOperacion);
  const puedeEnviar = grupo !== null && seleccion.metodoPagoId !== null && numeroOperacionValido;

  const lineas = [
    {
      monto: total,
      metodo: seleccion.metodo,
      metodoPagoId: seleccion.metodoPagoId,
      numeroOperacion: seleccion.requiereNumeroOperacion ? seleccion.numeroOperacion : null,
      tasaCambio: seleccion.tasaCambio,
    },
  ];

  function anular(id: string, nombre: string) {
    if (!window.confirm(`¿Anular "${nombre}"? Se quita de lo que debe el miembro.`)) return;
    iniciarTransicion(async () => {
      const resultado = await accionAnular(id);
      if (resultado.error) mostrarError(resultado.error);
      else if (resultado.ok) mostrarExito(resultado.ok);
    });
  }

  const bs = (usd: number) => (tasaActual !== null ? ` · Bs. ${formatearBs(usd * tasaActual)}` : "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-label="Cobrar deudas"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          Cobrar deudas
        </h3>

        {grupos.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--gx-muted)" }}>
            No hay productos pendientes de cobro.
          </p>
        ) : !grupo ? (
          <ul className="mt-4 flex flex-col gap-2">
            {grupos.map((g) => (
              <li key={g.miembroId}>
                <button
                  type="button"
                  onClick={() => setMiembroId(g.miembroId)}
                  className="flex w-full items-center justify-between rounded-xl border-2 px-3 py-3 text-left"
                  style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}
                >
                  <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                    {g.miembroNombre}
                  </span>
                  <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                    ${g.totalUSD.toFixed(2)}
                    {bs(g.totalUSD)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <form id={ID_FORMULARIO} action={enviar} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="miembroId" value={grupo.miembroId} />
            <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />

            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                {grupo.miembroNombre}
              </span>
              <button type="button" className="text-sm font-medium hover:underline" style={{ color: "var(--gx-accent)" }} onClick={() => setMiembroId(null)}>
                Otro miembro
              </button>
            </div>

            <ul className="flex flex-col gap-1">
              {grupo.deudas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
                  <span style={{ color: "var(--gx-ink)" }}>
                    {d.productoNombre}
                    {d.cantidad > 1 ? ` × ${d.cantidad}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span style={{ color: "var(--gx-muted)" }}>${totalDeudas([d]).toFixed(2)}</span>
                    <button
                      type="button"
                      disabled={anulando}
                      onClick={() => anular(d.id, d.productoNombre)}
                      className="font-medium hover:underline disabled:opacity-50"
                      style={{ color: "var(--gx-bad)" }}
                    >
                      Anular
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-between rounded-lg px-3 py-2" style={{ background: "var(--gx-surface-2)" }}>
              <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                Total ${total.toFixed(2)}
              </span>
              {tasaActual !== null && (
                <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                  Bs. {formatearBs(total * tasaActual)}
                </span>
              )}
            </div>

            <SelectorMetodoPago
              metodos={metodosPago}
              monto={total}
              idFormulario={ID_FORMULARIO}
              onCambio={setSeleccion}
              avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
            />
          </form>
        )}

        <div className="mt-4 flex gap-3">
          <Button type="button" variant="secundario" className="flex-1" onClick={onCerrar}>
            Cerrar
          </Button>
          {grupo && (
            <Button type="submit" form={ID_FORMULARIO} className="flex-1" disabled={!puedeEnviar || enviando}>
              {enviando ? "Cobrando..." : "Cobrar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
