"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { CalendarBlank } from "@phosphor-icons/react";
import "react-day-picker/style.css";

// Valor del campo: siempre "yyyy-mm-dd" (como <input type="date">), así los
// Server Actions y filtros existentes no cambian. Lo que ve el usuario es
// siempre dd/mm/aaaa, sin depender del idioma del navegador.
function isoADate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return fecha.getMonth() === Number(m[2]) - 1 ? fecha : undefined;
}

function dateAIso(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

function isoATexto(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

function textoAIso(texto: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return "";
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isoADate(iso) ? iso : "";
}

// Inserta las barras mientras se teclean solo dígitos: "25122026" → "25/12/2026".
function aplicarMascara(crudo: string): string {
  const d = crudo.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function InputFecha({
  label,
  name,
  id,
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  required,
  disabled,
  etiquetaOculta,
  sinCalendario,
  className = "",
}: {
  label: string;
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  /** Etiqueta sólo para lectores de pantalla (p. ej. celdas de tabla). */
  etiquetaOculta?: boolean;
  /** Sólo texto dd/mm/aaaa, sin botón ni popover (dentro de contenedores con overflow). */
  sinCalendario?: boolean;
  className?: string;
}) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(defaultValue);
  const iso = controlado ? value : interno;

  const [texto, setTexto] = useState(isoATexto(iso));
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const idError = useId();

  // Si el valor cambia desde afuera (p. ej. un botón que lo ajusta), se refleja en el texto.
  useEffect(() => {
    setTexto((actual) => (textoAIso(actual) === iso ? actual : isoATexto(iso)));
  }, [iso]);

  useEffect(() => {
    if (!abierto) return;
    function alClickAfuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClickAfuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClickAfuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  function confirmar(nuevoIso: string) {
    if (!controlado) setInterno(nuevoIso);
    onChange?.(nuevoIso);
  }

  const fueraDeRango = iso !== "" && ((min !== undefined && iso < min) || (max !== undefined && iso > max));
  const incompleto = texto !== "" && textoAIso(texto) === "";
  const seleccion = isoADate(iso);
  const minDate = min ? isoADate(min) : undefined;
  const maxDate = max ? isoADate(max) : undefined;
  const hoy = new Date();

  return (
    <div className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }} ref={contenedor}>
      <label htmlFor={id ?? idError + "-campo"} className={etiquetaOculta ? "sr-only" : undefined}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id ?? idError + "-campo"}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          pattern="\d{2}/\d{2}/\d{4}"
          title="Formato dd/mm/aaaa"
          required={required}
          disabled={disabled}
          aria-invalid={incompleto || fueraDeRango ? true : undefined}
          aria-describedby={incompleto || fueraDeRango ? idError : undefined}
          value={texto}
          onChange={(e) => {
            const nuevo = aplicarMascara(e.target.value);
            setTexto(nuevo);
            confirmar(textoAIso(nuevo));
          }}
          className={`min-h-11 w-full rounded-lg border pl-3 ${sinCalendario ? "pr-3" : "pr-11"} gx-campo ${className}`}
        />
        {!sinCalendario && (
        <button
          type="button"
          aria-label="Abrir calendario"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-[var(--gx-surface-elevada)] focus-visible:outline-2 focus-visible:outline-[var(--gx-accent)]"
          style={{ color: abierto ? "var(--gx-accent)" : "var(--gx-muted)" }}
        >
          <CalendarBlank size={20} />
        </button>
        )}

        {abierto && !sinCalendario && (
          <div
            className="selector-fecha absolute left-0 top-full z-50 mt-2 rounded-2xl border p-3 shadow-lg"
            style={{ background: "var(--gx-surface-elevada, var(--gx-surface))", borderColor: "var(--gx-edge)" }}
          >
            <DayPicker
              mode="single"
              locale={es}
              weekStartsOn={1}
              captionLayout="dropdown"
              startMonth={minDate ?? new Date(hoy.getFullYear() - 100, 0)}
              endMonth={maxDate ?? new Date(hoy.getFullYear() + 10, 11)}
              selected={seleccion}
              defaultMonth={seleccion ?? maxDate ?? hoy}
              disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
              onSelect={(fecha) => {
                confirmar(fecha ? dateAIso(fecha) : "");
                setTexto(fecha ? isoATexto(dateAIso(fecha)) : "");
                setAbierto(false);
              }}
            />
            <div className="mt-1 flex justify-between border-t pt-2" style={{ borderColor: "var(--gx-edge)" }}>
              <button
                type="button"
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm hover:bg-[var(--gx-surface-2)]"
                style={{ color: "var(--gx-muted)" }}
                onClick={() => {
                  confirmar("");
                  setTexto("");
                  setAbierto(false);
                }}
              >
                Borrar
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium hover:bg-[var(--gx-surface-2)]"
                style={{ color: "var(--gx-accent)" }}
                onClick={() => {
                  const hoyIso = dateAIso(hoy);
                  if ((min && hoyIso < min) || (max && hoyIso > max)) return;
                  confirmar(hoyIso);
                  setTexto(isoATexto(hoyIso));
                  setAbierto(false);
                }}
              >
                Hoy
              </button>
            </div>
          </div>
        )}
      </div>
      {(incompleto || fueraDeRango) && (
        <span id={idError} role="alert" className="text-xs" style={{ color: "var(--gx-bad)" }}>
          {incompleto
            ? "Fecha incompleta o inválida. Usa el formato dd/mm/aaaa."
            : `Fecha fuera del rango permitido${min ? ` (desde ${isoATexto(min)}` : ""}${max ? `${min ? " " : " ("}hasta ${isoATexto(max)}` : ""}${min || max ? ")" : ""}.`}
        </span>
      )}
      {name && <input type="hidden" name={name} value={iso} />}
    </div>
  );
}
