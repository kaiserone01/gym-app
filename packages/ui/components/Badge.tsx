import type { ReactNode } from "react";

type Tono = "verde" | "gris";

const ESTILOS: Record<Tono, string> = {
  verde: "bg-green-100 text-green-800",
  gris: "bg-neutral-100 text-neutral-600",
};

export function Badge({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[tono]}`}>{children}</span>;
}
