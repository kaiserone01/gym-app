import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "peligro";

const ESTILOS: Record<Variante, string> = {
  primario: "bg-blue-600 hover:bg-blue-500 text-white",
  secundario: "bg-neutral-200 hover:bg-neutral-300 text-neutral-900",
  peligro: "bg-red-600 hover:bg-red-500 text-white",
};

export function Button({
  variant = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante }) {
  return (
    <button
      className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${ESTILOS[variant]} ${className}`}
      {...props}
    />
  );
}
