"use client";

interface LineaMostrada {
  metodo: string;
  monto: number;
}

export function PanelRemanentePago({
  lineas,
  montoObjetivo,
  tasaReferencia,
}: {
  lineas: LineaMostrada[];
  montoObjetivo: number;
  // Tasa Bs/USD a usar para la conversión del remanente — se toma de la
  // primera línea que ya tenga una tasa elegida, o null si ninguna la
  // tiene todavía (en ese caso solo se muestra el remanente en USD).
  tasaReferencia: number | null;
}) {
  const sumaLineas = lineas.reduce((suma, l) => suma + l.monto, 0);
  const remanente = Math.max(0, montoObjetivo - sumaLineas);

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] w-72 rounded-xl border-2 p-4 shadow-2xl"
      style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
    >
      <p className="text-xs font-semibold uppercase" style={{ color: "var(--gx-muted)" }}>
        Distribución del pago
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {lineas
          .filter((l) => l.monto > 0)
          .map((linea, indice) => (
            <div key={indice} className="flex justify-between text-sm">
              <span style={{ color: "var(--gx-muted)" }}>{linea.metodo || "Sin método"}</span>
              <span style={{ color: "var(--gx-ink)" }}>${linea.monto.toFixed(2)}</span>
            </div>
          ))}
      </div>
      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--gx-edge)" }}>
        {remanente > 0 ? (
          <>
            <p className="text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
              Faltan ${remanente.toFixed(2)}
            </p>
            {tasaReferencia !== null && (
              <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                ≈ Bs. {(remanente * tasaReferencia).toFixed(2)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold" style={{ color: "var(--gx-accent)" }}>
            Monto completo
          </p>
        )}
      </div>
    </div>
  );
}
