"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { normalizarTexto } from "@/lib/normalizarTexto";
import { anularPagoAction, type EstadoAnularPago } from "./actions";

export interface PagoAnulable {
  id: string;
  fecha: string;
  concepto: string;
  metodo: string;
  monto: string;
  montoBs: string | null;
  referencia: string | null;
  ciclo: string | null;
}

const MOTIVO_MINIMO = 5;

function ModalAnularPago({ pagos, onCerrar }: { pagos: PagoAnulable[]; onCerrar: () => void }) {
  const router = useRouter();
  const { mostrarExito, mostrarError } = useFeedback();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [estado, accion, anulando] = useActionState<EstadoAnularPago, FormData>(anularPagoAction, {});

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    if (estado.ok) {
      mostrarExito(estado.ok);
      onCerrar();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado
  }, [estado]);

  const filtrados = useMemo(() => {
    const termino = normalizarTexto(busqueda.trim());
    if (!termino) return pagos;
    return pagos.filter((p) =>
      normalizarTexto(`${p.concepto} ${p.metodo} ${p.referencia ?? ""} ${p.monto}`).includes(termino)
    );
  }, [pagos, busqueda]);

  const seleccionado = pagos.find((p) => p.id === seleccionadoId) ?? null;
  const motivoValido = motivo.trim().length >= MOTIVO_MINIMO;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-label="Anular pago"
        className="flex max-h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-2xl border-2 p-5"
        style={{ borderColor: "var(--gx-bad)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-bold" style={{ color: "var(--gx-ink)" }}>
            Anular pago
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-base hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>

        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          Elige el pago a anular (últimos 2 meses). No se borra: queda registrado con tu nombre y el motivo, pero deja de contar en los totales.
        </p>

        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por miembro, método, monto o referencia…"
          aria-label="Buscar pago"
          className="min-h-11 rounded-lg border px-3 gx-campo"
        />

        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {filtrados.map((p) => {
            const activo = p.id === seleccionadoId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSeleccionadoId(p.id)}
                aria-pressed={activo}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm"
                style={{
                  borderColor: activo ? "var(--gx-bad)" : "var(--gx-edge)",
                  background: activo ? "color-mix(in srgb, var(--gx-bad) 12%, transparent)" : "var(--gx-surface-2)",
                  color: "var(--gx-ink)",
                }}
              >
                <span>
                  <span className="mr-2 tabular-nums" style={{ color: "var(--gx-muted)" }}>{p.fecha}</span>
                  <strong>{p.concepto}</strong> — {p.metodo}
                  {p.referencia && <span style={{ color: "var(--gx-muted)" }}> · #{p.referencia}</span>}
                </span>
                <span className="tabular-nums">
                  {p.monto}
                  {p.montoBs && <span style={{ color: "var(--gx-muted)" }}> · {p.montoBs}</span>}
                  {p.ciclo && <span style={{ color: "var(--gx-muted)" }}> · ciclo {p.ciclo}</span>}
                </span>
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <p className="py-4 text-center text-sm" style={{ color: "var(--gx-muted)" }}>
              No hay pagos que coincidan.
            </p>
          )}
        </div>

        <form action={accion} className="flex flex-col gap-3">
          <input type="hidden" name="pagoId" value={seleccionadoId ?? ""} />
          <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
            Motivo de la anulación (obligatorio)
            <textarea
              name="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              disabled={!seleccionado}
              placeholder={seleccionado ? "Ej.: Se registró como pago completo y era un abono de $10." : "Primero elige un pago."}
              className="rounded-lg border px-3 py-2 gx-campo"
            />
          </label>
          <div className="flex gap-3">
            <Button type="button" variant="secundario" className="flex-1" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant="peligro" className="flex-1" disabled={!seleccionado || !motivoValido || anulando}>
              {anulando ? "Anulando…" : "Anular pago"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Botón rojo junto a "Registrar pago": abre el asistente para anular un pago con motivo obligatorio.
export function BotonAnularPago({ pagos }: { pagos: PagoAnulable[] }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button type="button" variant="peligro" onClick={() => setAbierto(true)}>
        Anular pago
      </Button>
      {abierto && <ModalAnularPago pagos={pagos} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
