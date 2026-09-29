import type { ReactNode } from "react";

// Marco compartido de los asistentes de Caja (vender producto, cobrar deudas): ocupa el 98% de la
// pantalla, con la zona de trabajo a la izquierda y una columna lateral de resumen y acciones.
export function MarcoAsistente({
  titulo,
  etiqueta,
  onCerrar,
  children,
}: {
  titulo: string;
  etiqueta?: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-[1%]"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-label={titulo}
        className="flex h-full w-full flex-col overflow-y-auto rounded-2xl border-2 p-4 text-base lg:overflow-hidden lg:p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <h3 className="text-2xl font-bold" style={{ color: "var(--gx-ink)" }}>
              {titulo}
            </h3>
            {etiqueta && (
              <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                {etiqueta}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-base transition-colors duration-150 hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">{children}</div>
      </div>
    </div>
  );
}

export function ColumnaPrincipal({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:flex-1 lg:overflow-y-auto lg:pr-2">{children}</div>;
}

export function ColumnaLateral({ children }: { children: ReactNode }) {
  return (
    <aside
      className="flex flex-col gap-4 lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:pl-6"
      style={{ borderColor: "var(--gx-edge)" }}
    >
      {children}
    </aside>
  );
}

export function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
      {children}
    </p>
  );
}

// Tarjeta de opción única (forma de pago, modalidad): título, explicación y ✓ cuando está elegida.
export function TarjetaOpcion({
  titulo,
  descripcion,
  elegida,
  deshabilitada,
  onClick,
}: {
  titulo: string;
  descripcion: string;
  elegida: boolean;
  deshabilitada?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={elegida}
      disabled={deshabilitada}
      onClick={onClick}
      className="flex min-h-28 flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-colors duration-150 disabled:opacity-40"
      style={
        elegida
          ? { borderColor: "var(--gx-accent)", background: "color-mix(in srgb, var(--gx-accent) 12%, transparent)" }
          : { borderColor: "var(--gx-edge)" }
      }
    >
      <span className="flex w-full items-center justify-between gap-2 text-base font-semibold" style={{ color: "var(--gx-ink)" }}>
        {titulo}
        {elegida && (
          <span aria-hidden style={{ color: "var(--gx-accent)" }}>
            ✓
          </span>
        )}
      </span>
      <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
        {descripcion}
      </span>
    </button>
  );
}
