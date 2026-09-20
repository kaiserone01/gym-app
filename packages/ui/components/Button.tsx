import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "peligro" | "fantasma";

const ESTILOS: Record<Variante, string> = {
  primario: "bg-[var(--gx-accent)] text-[var(--gx-accent-ink)] hover:opacity-90",
  secundario:
    "bg-[var(--gx-surface-2)] text-[var(--gx-ink)] border border-[var(--gx-edge)] hover:border-[var(--gx-muted-dim)]",
  peligro: "bg-[var(--gx-bad)] text-[var(--gx-bad-ink)] hover:opacity-90",
  fantasma: "bg-transparent text-[var(--gx-muted)] hover:text-[var(--gx-ink)]",
};

export function Button({
  variant = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante }) {
  return (
    <button
      className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${ESTILOS[variant]} ${className}`}
      {...props}
    />
  );
}
