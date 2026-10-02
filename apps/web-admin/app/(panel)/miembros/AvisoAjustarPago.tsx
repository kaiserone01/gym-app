"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@gym-app/ui/components/Badge";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { MAX_DIAS_ATRAS_ULTIMO_PAGO } from "@gym-app/domain/entities/Pago";
import { ajustarUltimoPagoAction } from "./actions";

const ATAJOS_DIAS = [3, 5, 8, 12, 29];
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function formatearFecha(fecha: Date): string {
  return fecha.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Solo se muestra mientras el miembro tenga el aviso "Ajustar último pago". Dos caminos:
// ajustar el último pago a una fecha pasada (sin dinero, sin turno) o registrar un pago normal en Caja.
export function AvisoAjustarPago({ miembroId, diasCiclo }: { miembroId: string; diasCiclo: number }) {
  const [dias, setDias] = useState("");
  const [pendiente, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  const diasNumero = dias === "" ? null : Number(dias);
  const valido = diasNumero !== null && Number.isInteger(diasNumero) && diasNumero >= 0 && diasNumero <= MAX_DIAS_ATRAS_ULTIMO_PAGO;
  const fechaPago = valido ? new Date(Date.now() - diasNumero * MS_POR_DIA) : null;
  const fechaVencimiento = fechaPago ? new Date(fechaPago.getTime() + diasCiclo * MS_POR_DIA) : null;

  function ajustar() {
    if (!valido) return;
    iniciarTransicion(async () => {
      try {
        await ajustarUltimoPagoAction(miembroId, diasNumero);
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo ajustar el último pago.");
      }
    });
  }

  return (
    <div
      className="mb-6 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: "var(--gx-warn)", color: "var(--gx-ink)" }}
    >
      <span className="flex flex-wrap items-center gap-2">
        <Badge tono="ambar">Ajustar último pago</Badge>
        La fecha de vencimiento viene de la migración y no es confiable. Indica cuándo fue el último pago o registra uno nuevo.
      </span>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5" style={{ color: "var(--gx-muted)" }}>
          ¿Hace cuántos días fue el último pago?
          <input
            type="number"
            min={0}
            max={MAX_DIAS_ATRAS_ULTIMO_PAGO}
            inputMode="numeric"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            placeholder="Días"
            className="titilar-fecha min-h-11 w-32 rounded-lg border px-3 outline-none"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          />
        </label>
        <span className="flex flex-wrap gap-2">
          {ATAJOS_DIAS.map((atajo) => (
            <Button key={atajo} type="button" variant="secundario" onClick={() => setDias(String(atajo))}>
              Hace {atajo}
            </Button>
          ))}
        </span>
      </div>

      {fechaPago && fechaVencimiento && (
        <p style={{ color: "var(--gx-muted)" }}>
          Último pago: <strong style={{ color: "var(--gx-ink)" }}>{formatearFecha(fechaPago)}</strong> — vencería el{" "}
          <strong style={{ color: "var(--gx-ink)" }}>{formatearFecha(fechaVencimiento)}</strong> ({diasCiclo} días de plan).
        </p>
      )}

      <span className="flex flex-wrap gap-2">
        <Button type="button" onClick={ajustar} disabled={!valido || pendiente}>
          Ajustar último pago
        </Button>
        <Link href={`/caja?cobrar=${miembroId}`}>
          <Button type="button" variant="secundario">
            Registrar pago
          </Button>
        </Link>
      </span>
    </div>
  );
}
