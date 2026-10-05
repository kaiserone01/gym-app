"use client";

import { Button } from "@gym-app/ui/components/Button";
import { totalDeudas } from "@gym-app/domain/entities/DeudaProducto";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { formatearBs } from "../tasaBcvFija";

// Solo lectura: los productos que el miembro debe (se abre desde el aviso de
// deuda del paso de pago). Se dibuja encima del wizard, por eso el z-index
// mayor y que un clic acá nunca cierre el modal de atrás.
export function ModalDetalleDeuda({
  grupo,
  tasaActual,
  onCerrar,
}: {
  grupo: GrupoDeudasMiembro;
  tasaActual: number | null;
  onCerrar: () => void;
}) {
  const bs = (usd: number) => (tasaActual !== null ? `Bs. ${formatearBs(usd * tasaActual)}` : null);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={(e) => {
        e.stopPropagation();
        onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-label={`Productos que debe ${grupo.miembroNombre}`}
        className="marca-agua-modal flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-warn)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          Productos pendientes de pago
        </h3>
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          {grupo.miembroNombre}
        </p>

        <ul className="mt-4 flex flex-col gap-1">
          {grupo.deudas.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
              <span className="min-w-0 break-words" style={{ color: "var(--gx-ink)" }}>
                {d.productoNombre}
                {d.cantidad > 1 ? ` × ${d.cantidad}` : ""}
                <span className="block text-xs" style={{ color: "var(--gx-muted)" }}>
                  ${d.precioUnitarioUSD.toFixed(2)} c/u · {d.creadaEn.toLocaleDateString("es-VE")}
                </span>
              </span>
              <span className="shrink-0 font-medium" style={{ color: "var(--gx-ink)" }}>
                ${totalDeudas([d]).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--gx-edge)" }}>
          <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
            Total ${grupo.totalUSD.toFixed(2)}
          </span>
          {bs(grupo.totalUSD) && (
            <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
              {bs(grupo.totalUSD)}
            </span>
          )}
        </div>

        <Button type="button" variant="secundario" className="mt-4" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
