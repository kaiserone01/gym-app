"use client";

import { useEffect, useState } from "react";

type Operador = "+" | "−" | "×" | "÷";

const TECLAS_OPERADOR: Record<string, Operador> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const formatoNumero = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 8 });
const formatoBs = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "12.5" -> "12,5", "1234" -> "1.234"; conserva el punto final mientras se escribe ("12." -> "12,").
function mostrar(valor: string): string {
  if (valor === "Error") return valor;
  const [entero, decimales] = valor.split(".");
  const base = formatoNumero.format(Number(entero));
  return decimales === undefined ? base : `${base},${decimales}`;
}

function esCampoEditable(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

const CLASE_TECLA =
  "h-11 cursor-pointer rounded-lg border text-lg font-semibold outline-none transition-all duration-150 hover:border-[var(--gx-field-edge-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gx-accent)] active:scale-95";

export function Calculadora() {
  const [abierta, setAbierta] = useState(false);
  const [actual, setActual] = useState("0");
  const [previo, setPrevio] = useState<number | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [nuevo, setNuevo] = useState(true);
  const [tasa, setTasa] = useState<number | null>(null);
  const [dolares, setDolares] = useState("");

  // Tasa BCV vigente: misma ruta que usa el reloj del panel.
  useEffect(() => {
    if (!abierta) return;
    fetch("/api/tasa-cambio")
      .then((res) => (res.ok ? res.json() : null))
      .then((datos: { valor?: number } | null) => {
        if (datos?.valor !== undefined) setTasa(datos.valor);
      })
      .catch(() => {});
  }, [abierta]);

  function digito(d: string) {
    if (nuevo) {
      setActual(d === "." ? "0." : d);
      setNuevo(false);
    } else if (d === "." && actual.includes(".")) {
      return;
    } else {
      setActual(actual === "0" && d !== "." ? d : actual + d);
    }
  }

  function calcular(a: number, b: number, op: Operador) {
    if (op === "+") return a + b;
    if (op === "−") return a - b;
    if (op === "×") return a * b;
    return b === 0 ? NaN : a / b;
  }

  function resultado(valor: number) {
    return Number.isFinite(valor) ? String(Math.round(valor * 1e8) / 1e8) : "Error";
  }

  function operar(op: Operador) {
    if (actual === "Error") return;
    if (operador && previo !== null && !nuevo) {
      const r = resultado(calcular(previo, Number(actual), operador));
      setActual(r);
      setPrevio(r === "Error" ? null : Number(r));
    } else {
      setPrevio(Number(actual));
    }
    setOperador(op);
    setNuevo(true);
  }

  function igual() {
    if (!operador || previo === null) return;
    setActual(resultado(calcular(previo, Number(actual), operador)));
    setPrevio(null);
    setOperador(null);
    setNuevo(true);
  }

  function borrarUno() {
    if (nuevo || actual.length <= 1 || actual === "Error") {
      setActual("0");
      setNuevo(true);
    } else {
      setActual(actual.slice(0, -1));
    }
  }

  function limpiar() {
    setActual("0");
    setPrevio(null);
    setOperador(null);
    setNuevo(true);
  }

  // Teclado físico (incluido el numpad) mientras el panel está abierto, salvo si se está escribiendo en un campo.
  useEffect(() => {
    if (!abierta) return;
    function alPulsar(e: KeyboardEvent) {
      if (e.key === "Escape") return setAbierta(false);
      if (esCampoEditable(e.target)) return;
      if (/^[0-9]$/.test(e.key)) digito(e.key);
      else if (e.key === "." || e.key === ",") digito(".");
      else if (e.key in TECLAS_OPERADOR) operar(TECLAS_OPERADOR[e.key]);
      else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        igual();
      } else if (e.key === "Backspace") borrarUno();
    }
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  });

  const dolaresNumero = Number(dolares.replace(",", "."));
  const bolivares = tasa !== null && Number.isFinite(dolaresNumero) ? formatoBs.format(dolaresNumero * tasa) : "0,00";

  const estiloTecla = { background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" };
  const estiloOperador = { ...estiloTecla, color: "var(--gx-accent)" };

  return (
    <div className="relative print:hidden">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-controls="panel-calculadora"
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--gx-accent)] px-4 text-sm font-semibold text-[var(--gx-accent-ink)] outline-none transition-all duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--gx-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gx-surface)] active:scale-95"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="1.5" width="18" height="21" rx="3" fill="#2b3340" />
          <rect x="5.5" y="4" width="13" height="5" rx="1.2" fill="#9fe5ff" />
          <rect x="5.5" y="11" width="3.4" height="3" rx=".8" fill="#ffd166" />
          <rect x="10.3" y="11" width="3.4" height="3" rx=".8" fill="#ffd166" />
          <rect x="15.1" y="11" width="3.4" height="3" rx=".8" fill="#ff7a59" />
          <rect x="5.5" y="15.5" width="3.4" height="3" rx=".8" fill="#ffd166" />
          <rect x="10.3" y="15.5" width="3.4" height="3" rx=".8" fill="#ffd166" />
          <rect x="15.1" y="15.5" width="3.4" height="5" rx=".8" fill="#4cc9a0" />
        </svg>
        CALCULADORA
      </button>

      {abierta && (
        <div
          id="panel-calculadora"
          role="dialog"
          aria-label="Calculadora"
          className="absolute left-0 top-full z-30 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border p-3.5 shadow-2xl"
          style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <b className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--gx-muted)" }}>
              Calculadora
            </b>
            <button
              type="button"
              onClick={() => setAbierta(false)}
              aria-label="Cerrar"
              className="h-8 w-8 cursor-pointer rounded-md text-xl hover:bg-[var(--gx-surface-2)]"
              style={{ color: "var(--gx-muted)" }}
            >
              ×
            </button>
          </div>

          <div
            className="mb-2.5 rounded-xl border px-3.5 py-2.5 text-right"
            style={{ background: "var(--gx-ground)", borderColor: "var(--gx-edge)" }}
          >
            <small className="block min-h-4 text-xs" style={{ color: "var(--gx-muted-dim)" }}>
              {previo !== null && operador ? `${mostrar(String(previo))} ${operador}` : ""}
            </small>
            <output className="block overflow-x-auto whitespace-nowrap text-[34px] font-semibold tabular-nums" style={{ color: "var(--gx-ink)" }}>
              {mostrar(actual)}
            </output>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" onClick={limpiar} className={CLASE_TECLA} style={{ ...estiloTecla, color: "var(--gx-bad)" }}>C</button>
            <button type="button" onClick={borrarUno} aria-label="Borrar un dígito" className={CLASE_TECLA} style={estiloTecla}>⌫</button>
            <button type="button" onClick={() => operar("÷")} className={CLASE_TECLA} style={estiloOperador}>÷</button>
            <button type="button" onClick={() => operar("×")} className={CLASE_TECLA} style={estiloOperador}>×</button>
            {["7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => digito(d)} className={CLASE_TECLA} style={estiloTecla}>{d}</button>
            ))}
            <button type="button" onClick={() => operar("−")} className={CLASE_TECLA} style={estiloOperador}>−</button>
            {["4", "5", "6"].map((d) => (
              <button key={d} type="button" onClick={() => digito(d)} className={CLASE_TECLA} style={estiloTecla}>{d}</button>
            ))}
            <button type="button" onClick={() => operar("+")} className={CLASE_TECLA} style={estiloOperador}>+</button>
            {["1", "2", "3"].map((d) => (
              <button key={d} type="button" onClick={() => digito(d)} className={CLASE_TECLA} style={estiloTecla}>{d}</button>
            ))}
            <button
              type="button"
              onClick={igual}
              className={`${CLASE_TECLA} row-span-2 h-auto`}
              style={{ background: "var(--gx-accent)", borderColor: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
            >
              =
            </button>
            <button type="button" onClick={() => digito("0")} className={`${CLASE_TECLA} col-span-2`} style={estiloTecla}>0</button>
            <button type="button" onClick={() => digito(".")} className={CLASE_TECLA} style={estiloTecla}>,</button>
          </div>

          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--gx-edge)" }}>
            <div className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--gx-muted)" }}>
              Dólar BCV
              <em className="text-sm normal-case not-italic tracking-normal tabular-nums" style={{ color: "var(--gx-ink)" }}>
                {tasa !== null ? `Bs. ${formatoBs.format(tasa)}` : "Consultando…"}
              </em>
            </div>
            {tasa !== null && (
              <p className="mb-2.5 mt-1.5 text-sm font-semibold tabular-nums" style={{ color: "var(--gx-accent)" }}>
                1 $ = {formatoBs.format(tasa)} Bs
              </p>
            )}
            <label htmlFor="calculadora-dolares" className="mb-1.5 mt-2 block text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--gx-muted)" }}>
              $ a Bs
            </label>
            <div
              className="flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-field-edge)" }}
            >
              <span className="font-semibold" style={{ color: "var(--gx-muted)" }}>$</span>
              <input
                id="calculadora-dolares"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={dolares}
                onChange={(e) => setDolares(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="min-w-0 flex-1 bg-transparent text-right text-lg font-semibold tabular-nums outline-none"
                style={{ color: "var(--gx-ink)" }}
              />
            </div>
            <div
              className="mt-2 flex items-baseline justify-between rounded-lg border px-3 py-2.5"
              style={{ background: "var(--gx-ground)", borderColor: "var(--gx-edge)" }}
            >
              <span className="font-semibold" style={{ color: "var(--gx-muted)" }}>Bs.</span>
              <output className="text-2xl font-bold tabular-nums" style={{ color: "var(--gx-accent)" }}>{bolivares}</output>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
