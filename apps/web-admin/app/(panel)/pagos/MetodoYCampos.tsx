import type { ReactNode } from "react";

// Método de pago a la izquierda y, a la derecha, una tarjeta angosta con el monto y la referencia,
// para que las casillas tengan un ancho acorde a lo que se escribe en ellas.
export function MetodoYCampos({ selector, campos, vacio }: { selector: ReactNode; campos: ReactNode; vacio: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-6">
      <div className="min-w-0">{selector}</div>
      <div className="flex flex-col gap-4 rounded-xl border p-4 xl:self-start" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
          Monto y referencia
        </p>
        {campos || (
          <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
            {vacio}
          </p>
        )}
      </div>
    </div>
  );
}
