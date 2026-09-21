"use client";

import { useEffect, useRef, useState } from "react";

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
  // El último valor numérico que ESTE input emitió hacia el padre vía
  // onChange — permite distinguir "el padre me devolvió el mismo valor
  // que yo le mandé" (no tocar `interno`, para no pisar lo que el
  // usuario está tipeando) de "el padre cambió el valor por su cuenta"
  // (ej. precarga desde un fetch, otro control que resetea el monto —
  // ahí sí hay que resincronizar `interno`). Sin esto, cada tecleo podía
  // rebotar: setInterno(texto) local, el padre re-renderiza con el mismo
  // valor, y el useEffect de abajo pisaba `interno` de vuelta.
  const ultimoEmitido = useRef<string | undefined>(value);

  useEffect(() => {
    if (value !== undefined && value !== ultimoEmitido.current) {
      setInterno(formatearVisual(value));
      ultimoEmitido.current = value;
    }
  }, [value]);

  function manejarCambio(texto: string) {
    const numerico = aValorNumerico(texto);
    setInterno(texto);
    ultimoEmitido.current = numerico;
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
