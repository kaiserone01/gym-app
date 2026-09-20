"use client";

import { useEffect, useState } from "react";

// Formato monetario latino: punto para miles, coma para decimales
// ("1.234,56") — el que espera el usuario del panel, distinto del
// formato "1,234.56" que usaría type="number" nativo. El valor real
// (numérico, con punto decimal) viaja en un <input type="hidden"> con
// el `name` del campo, así los Server Actions existentes no cambian
// (siguen leyendo FormData.get(name) como string numérico plano).
function formatearVisual(valorNumerico: string): string {
  if (valorNumerico === "" || valorNumerico === "-") return valorNumerico;
  const numero = Number(valorNumerico);
  if (Number.isNaN(numero)) return valorNumerico;

  const [enteroStr, decimalStr] = valorNumerico.split(".");
  const enteroFormateado = new Intl.NumberFormat("es-VE").format(Number(enteroStr || "0"));
  return decimalStr !== undefined ? `${enteroFormateado},${decimalStr}` : enteroFormateado;
}

// Del texto que el usuario tipea (con puntos de miles y coma decimal)
// al string numérico plano que usa el resto del sistema.
function aValorNumerico(textoVisual: string): string {
  const limpio = textoVisual.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d*\.?\d*$/.test(limpio)) return "";
  return limpio;
}

export function CurrencyInput({
  name,
  label,
  moneda,
  required,
  defaultValue = "",
  value,
  onChange,
  className = "",
}: {
  name: string;
  label: string;
  moneda: "USD" | "Bs";
  required?: boolean;
  defaultValue?: string;
  /** Modo controlado (opcional) — string numérico plano, igual al que se envía en el hidden input. */
  value?: string;
  onChange?: (valorNumerico: string) => void;
  className?: string;
}) {
  const [interno, setInterno] = useState(() => formatearVisual(String(value ?? defaultValue ?? "")));

  // Modo controlado: si el padre cambia `value` externamente, refleja el nuevo formato visual.
  useEffect(() => {
    if (value !== undefined) setInterno(formatearVisual(value));
  }, [value]);

  function manejarCambio(texto: string) {
    const numerico = aValorNumerico(texto);
    setInterno(texto);
    onChange?.(numerico);
  }

  const valorNumericoActual = value !== undefined ? value : aValorNumerico(interno);

  return (
    <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
      {label}
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="decimal"
          required={required}
          value={interno}
          onChange={(e) => manejarCambio(e.target.value)}
          onBlur={() => setInterno(formatearVisual(valorNumericoActual))}
          placeholder="0,00"
          className={`min-h-11 w-full rounded-lg border pl-3 pr-14 outline-none transition-colors duration-150 focus:border-[var(--gx-accent)] disabled:opacity-50 ${className}`}
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        />
        <span
          className="pointer-events-none absolute right-3 text-xs font-semibold"
          style={{ color: "var(--gx-muted)" }}
        >
          {moneda}
        </span>
      </div>
      <input type="hidden" name={name} value={valorNumericoActual} />
    </label>
  );
}
