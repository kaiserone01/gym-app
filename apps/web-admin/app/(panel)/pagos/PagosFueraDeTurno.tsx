"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";

export interface FilaFueraDeTurno {
  id: string;
  fecha: string;
  concepto: string;
  metodo: string;
  monto: string;
  tasa: string;
  montoBs: string;
}

// Botón junto al selector de fechas: despliega los pagos registrados fuera de turno del período, con su fecha.
export function PagosFueraDeTurno({ filas }: { filas: FilaFueraDeTurno[] }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button type="button" variant={abierto ? "primario" : "secundario"} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        PAGOS FUERA DE TURNO
      </Button>

      {abierto && (
        <div
          className="basis-full rounded-2xl border p-5 text-sm"
          style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}
        >
          <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-warn)" }}>
            Pagos fuera de turno
          </h2>
          {filas.length === 0 && <p style={{ color: "var(--gx-muted)" }}>No hay pagos fuera de turno en este período.</p>}
          {filas.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap justify-between gap-x-4 border-b py-2"
              style={{ borderColor: "color-mix(in srgb, var(--gx-warn) 30%, transparent)", color: "var(--gx-ink)" }}
            >
              <span>
                <span className="mr-3 tabular-nums" style={{ color: "var(--gx-muted)" }}>{f.fecha}</span>
                {f.concepto} — {f.metodo}
              </span>
              <span className="flex gap-3 tabular-nums">
                <span>{f.monto}</span>
                <span>{f.tasa}</span>
                <span>{f.montoBs}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
