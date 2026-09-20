import type { ReactNode } from "react";

type Tono = "verde" | "gris" | "ambar" | "rojo";

const ESTILOS: Record<Tono, string> = {
  verde: "bg-[color-mix(in_srgb,var(--gx-good)_18%,transparent)] text-[var(--gx-good)]",
  gris: "bg-[var(--gx-surface-2)] text-[var(--gx-muted)]",
  ambar: "bg-[color-mix(in_srgb,var(--gx-warn)_18%,transparent)] text-[var(--gx-warn)]",
  rojo: "bg-[color-mix(in_srgb,var(--gx-bad)_18%,transparent)] text-[var(--gx-bad)]",
};

export function Badge({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[tono]}`}>{children}</span>;
}
