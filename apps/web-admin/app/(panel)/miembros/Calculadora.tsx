"use client";

import { useEffect, useRef, useState } from "react";

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

// Con coma, los puntos son miles; sin coma, "90.162" son miles y "12.5" es decimal.
function leerMonto(texto: string): number {
  let t = texto.trim();
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return parseFloat(t);
}

function esCampoEditable(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

// El cursor queda siempre detrás del último número (también con clic en un campo derecho-alineado).
function cursorAlFinal(el: HTMLInputElement) {
  el.setSelectionRange(el.value.length, el.value.length);
}

const CLASE_TECLA =
  "h-11 cursor-pointer rounded-lg border text-2xl font-bold outline-none transition-all duration-150 hover:border-[var(--gx-field-edge-hover)] focus-visible:ring-2 focus-visible:ring-[var(--gx-accent)] active:scale-95";

const POSICION_INICIAL = { x: null as number | null, y: 72 };

export function Calculadora() {
  const [abierta, setAbierta] = useState(false);
  const [actual, setActual] = useState("0");
  const [previo, setPrevio] = useState<number | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [nuevo, setNuevo] = useState(true);
  const [tasa, setTasa] = useState<number | null>(null);
  const [dolares, setDolares] = useState("1");
  const [bolivares, setBolivares] = useState("");
  const [pos, setPos] = useState(POSICION_INICIAL);
  const panel = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ dx: number; dy: number } | null>(null);

  // Tasa BCV vigente: misma ruta que usa el reloj del panel.
  useEffect(() => {
    if (!abierta) return;
    fetch("/api/tasa-cambio")
      .then((res) => (res.ok ? res.json() : null))
      .then((datos: { valor?: number } | null) => {
        if (datos?.valor !== undefined) {
          setTasa(datos.valor);
          setBolivares(formatoBs.format(leerMonto("1") * datos.valor));
          setDolares("1");
        }
      })
      .catch(() => {});
  }, [abierta]);

  function abrirOCerrar() {
    if (!abierta) setPos(POSICION_INICIAL);
    setAbierta((v) => !v);
  }

  function alEscribirDolares(texto: string) {
    const limpio = texto.replace(/[^0-9.,]/g, "");
    setDolares(limpio);
    const v = leerMonto(limpio);
    setBolivares(tasa !== null && Number.isFinite(v) ? formatoBs.format(v * tasa) : "");
  }

  function alEscribirBolivares(texto: string) {
    const limpio = texto.replace(/[^0-9.,]/g, "");
    setBolivares(limpio);
    const v = leerMonto(limpio);
    setDolares(tasa !== null && Number.isFinite(v) ? String(Math.round((v / tasa) * 100) / 100).replace(".", ",") : "");
  }

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

  // Arrastre desde la barra de título, sin sacar el panel de la ventana.
  function iniciarArrastre(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button") || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    arrastre.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moverArrastre(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastre.current || !panel.current) return;
    const { width, height } = panel.current.getBoundingClientRect();
    setPos({
      x: Math.min(Math.max(0, e.clientX - arrastre.current.dx), window.innerWidth - width),
      y: Math.min(Math.max(0, e.clientY - arrastre.current.dy), window.innerHeight - height),
    });
  }

  const estiloTecla = { background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" };
  const estiloOperador = { ...estiloTecla, color: "var(--gx-accent)" };
  const estiloPanel =
    pos.x === null
      ? { top: pos.y, left: "50%", transform: "translateX(-50%)" }
      : { top: pos.y, left: pos.x };

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={abrirOCerrar}
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
          ref={panel}
          id="panel-calculadora"
          role="dialog"
          aria-label="Calculadora"
          className="fixed z-50 w-[560px] max-w-[calc(100vw-1rem)] rounded-2xl border shadow-2xl"
          style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)", ...estiloPanel }}
        >
          <div
            onPointerDown={iniciarArrastre}
            onPointerMove={moverArrastre}
            onPointerUp={() => (arrastre.current = null)}
            onPointerCancel={() => (arrastre.current = null)}
            className="flex cursor-grab touch-none select-none items-center justify-between rounded-t-2xl border-b py-2 pl-3.5 pr-2 active:cursor-grabbing"
            style={{ borderColor: "var(--gx-edge)" }}
          >
            <b className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--gx-muted)" }}>
              <span aria-hidden="true" style={{ color: "var(--gx-muted-dim)" }}>⋮⋮</span>
              Calculadora
            </b>
            <button
              type="button"
              onClick={() => setAbierta(false)}
              aria-label="Cerrar"
              className="h-10 w-10 cursor-pointer rounded-md text-4xl font-bold leading-none hover:bg-[var(--gx-surface-2)]"
              style={{ color: "var(--gx-bad)" }}
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 p-3.5 sm:grid-cols-[1.65fr_1fr]">
            <div>
              <div
                className="mb-2 rounded-xl border px-3 py-2 text-right"
                style={{ background: "var(--gx-ground)", borderColor: "var(--gx-edge)" }}
              >
                <small className="block min-h-4 text-xs" style={{ color: "var(--gx-muted-dim)" }}>
                  {previo !== null && operador ? `${mostrar(String(previo))} ${operador}` : ""}
                </small>
                <output className="block overflow-x-auto whitespace-nowrap text-[40px] font-semibold leading-tight tabular-nums" style={{ color: "var(--gx-ink)" }}>
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
            </div>

            <div
              className="flex min-w-0 flex-col justify-between gap-2.5 rounded-xl border p-3"
              style={{ background: "var(--gx-ground)", borderColor: "var(--gx-field-edge)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--gx-accent)" }}>
                    Calculadora $ a BCV
                  </div>
                  <div className="mt-0.5 text-[21px] font-bold tabular-nums" style={{ color: "var(--gx-ink)" }}>
                    {tasa !== null ? `Bs. ${formatoBs.format(tasa)}` : "Consultando…"}
                  </div>
                </div>
                <img
                  src="/branding/adrenalina-icono-chico.png"
                  alt="Adrenalina Xtreme Gym"
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0"
                  style={{ filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--gx-accent) 35%, transparent))" }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div
                  className="flex h-[50px] items-center gap-2 rounded-[10px] border px-3.5 focus-within:border-[var(--gx-accent)]"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-field-edge)" }}
                >
                  <span className="text-lg font-semibold" style={{ color: "var(--gx-muted)" }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label="Dólares a convertir"
                    placeholder="0,00"
                    value={dolares}
                    onChange={(e) => alEscribirDolares(e.target.value)}
                    onFocus={(e) => setTimeout(() => cursorAlFinal(e.target), 0)}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      cursorAlFinal(e.currentTarget);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-right text-xl font-semibold tabular-nums outline-none"
                    style={{ color: "var(--gx-ink)" }}
                  />
                </div>
                <div className="text-center text-sm leading-none" style={{ color: "var(--gx-muted-dim)" }} aria-hidden="true">▼</div>
                <div
                  className="flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-[var(--gx-accent)]/25"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-accent)" }}
                >
                  <span className="text-lg font-semibold" style={{ color: "var(--gx-muted)" }}>Bs.</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label="Bolívares a convertir"
                    placeholder="0,00"
                    value={bolivares}
                    onChange={(e) => alEscribirBolivares(e.target.value)}
                    onFocus={(e) => setTimeout(() => cursorAlFinal(e.target), 0)}
                    onMouseUp={(e) => {
                      e.preventDefault();
                      cursorAlFinal(e.currentTarget);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-right text-[22px] font-bold tabular-nums outline-none"
                    style={{ color: "var(--gx-accent)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
