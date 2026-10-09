import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "peligro" | "fantasma";

const ESTILOS: Record<Variante, string> = {
  primario: "bg-[var(--gx-accent)] text-[var(--gx-accent-ink)] hover:opacity-90",
  secundario:
    "bg-[var(--gx-surface-elevada)] text-[var(--gx-ink)] border border-[var(--gx-field-edge)] hover:border-[var(--gx-field-edge-hover)] hover:bg-[var(--gx-surface-2)]",
  peligro: "bg-[var(--gx-bad)] text-[var(--gx-bad-ink)] hover:opacity-90",
  fantasma: "bg-transparent text-[var(--gx-muted)] hover:bg-[var(--gx-surface-2)] hover:text-[var(--gx-ink)]",
};

export function Button({
  variant = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante }) {
  return (
    <button
      className={`min-h-11 cursor-pointer rounded-lg px-4 text-sm font-semibold outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--gx-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gx-surface)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${ESTILOS[variant]} ${className}`}
      {...props}
    />
  );
}
