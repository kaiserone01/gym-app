"use client";

import { useEffect, useState } from "react";

interface FilaHistorial {
  fecha: string;
  valor: number;
  fuente: string;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
  createdAt: string;
}

type RespuestaFecha =
  | { tipo: "ENCONTRADA"; tasa: FilaHistorial }
  | { tipo: "NO_ENCONTRADA"; masCercanaAnterior: FilaHistorial | null };

const LIMITE = 20;

function formatearFechaValor(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function formatearHora12(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatearMonto(valor: number): string {
  return valor.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Columna "Registrado por": AUTO: DolarAPI (BCV, sin hora — DolarAPI no
// expone la hora real de publicación del BCV, ver Global Constraints del
// plan) / Nombre (hora am-pm) para MANUAL con usuario conocido / "Usuario
// no registrado (hora)" para MANUAL sin registradoPorId (filas previas a
// esta migración).
function etiquetaRegistrador(fila: FilaHistorial): string {
  if (fila.fuente !== "MANUAL") return "AUTO: DolarAPI";
  const hora = formatearHora12(fila.createdAt);
  const nombre = fila.registradoPorNombre ?? "Usuario no registrado";
  return `${nombre} (${hora})`;
}

function FilaTabla({ fila }: { fila: FilaHistorial }) {
  return (
    <tr className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
      <td className="py-2" style={{ color: "var(--gx-ink)" }}>{formatearFechaValor(fila.fecha)}</td>
      <td className="py-2" style={{ color: "var(--gx-ink)" }}>Bs. {formatearMonto(fila.valor)}</td>
      <td className="py-2" style={{ color: "var(--gx-muted)" }}>{etiquetaRegistrador(fila)}</td>
    </tr>
  );
}

function CardFila({ fila }: { fila: FilaHistorial }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
      <div className="flex justify-between">
        <span style={{ color: "var(--gx-muted)" }}>{formatearFechaValor(fila.fecha)}</span>
        <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>Bs. {formatearMonto(fila.valor)}</span>
      </div>
      <span className="text-xs" style={{ color: "var(--gx-muted)" }}>{etiquetaRegistrador(fila)}</span>
    </div>
  );
}

function ListaHistorial({ filas }: { filas: FilaHistorial[] }) {
  return (
    <>
      <div className="lg:hidden flex flex-col gap-2">
        {filas.map((f) => <CardFila key={f.fecha} fila={f} />)}
      </div>
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
              <th className="py-2">Fecha valor</th>
              <th className="py-2">Monto</th>
              <th className="py-2">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => <FilaTabla key={f.fecha} fila={f} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ModalHistorialTasas({ onCerrar }: { onCerrar: () => void }) {
  const [modo, setModo] = useState<"recientes" | "fecha">("recientes");

  // Modo "recientes"
  const [filas, setFilas] = useState<FilaHistorial[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  // Modo "fecha"
  const [fechaElegida, setFechaElegida] = useState("");
  const [resultadoFecha, setResultadoFecha] = useState<RespuestaFecha | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (modo !== "recientes") return;
    setCargando(true);
    fetch(`/api/tasa-cambio/historial?limite=${LIMITE}`)
      .then((res) => res.json())
      .then((datos: { filas: FilaHistorial[]; hayMas: boolean }) => {
        setFilas(datos.filas);
        setHayMas(datos.hayMas);
      })
      .finally(() => setCargando(false));
  }, [modo]);

  function cargarMas() {
    const ultima = filas[filas.length - 1];
    if (!ultima) return;
    setCargandoMas(true);
    fetch(`/api/tasa-cambio/historial?limite=${LIMITE}&antesDe=${encodeURIComponent(ultima.fecha)}`)
      .then((res) => res.json())
      .then((datos: { filas: FilaHistorial[]; hayMas: boolean }) => {
        setFilas((prev) => [...prev, ...datos.filas]);
        setHayMas(datos.hayMas);
      })
      .finally(() => setCargandoMas(false));
  }

  function buscarPorFecha(fecha: string) {
    setFechaElegida(fecha);
    if (!fecha) {
      setResultadoFecha(null);
      return;
    }
    setBuscando(true);
    fetch(`/api/tasa-cambio/historial?fecha=${fecha}`)
      .then((res) => res.json())
      .then((datos: RespuestaFecha) => setResultadoFecha(datos))
      .finally(() => setBuscando(false));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            Historial de tasa BCV
          </h3>
          <button type="button" onClick={onCerrar} className="text-sm" style={{ color: "var(--gx-muted)" }}>
            Cerrar
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setModo("recientes")}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={
              modo === "recientes"
                ? { background: "var(--gx-accent)", color: "white" }
                : { border: "1px solid var(--gx-edge)", color: "var(--gx-ink)" }
            }
          >
            Últimas
          </button>
          <button
            type="button"
            onClick={() => setModo("fecha")}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={
              modo === "fecha"
                ? { background: "var(--gx-accent)", color: "white" }
                : { border: "1px solid var(--gx-edge)", color: "var(--gx-ink)" }
            }
          >
            Buscar por fecha
          </button>
        </div>

        {modo === "recientes" && (
          <div className="mt-4 flex flex-col gap-3">
            {cargando ? (
              <p className="text-sm" style={{ color: "var(--gx-muted)" }}>Cargando...</p>
            ) : filas.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--gx-muted)" }}>No hay tasas registradas todavía.</p>
            ) : (
              <>
                <ListaHistorial filas={filas} />
                {hayMas && (
                  <button
                    type="button"
                    onClick={cargarMas}
                    disabled={cargandoMas}
                    className="self-center rounded-lg border px-4 py-2 text-sm font-medium"
                    style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                  >
                    {cargandoMas ? "Cargando..." : "Cargar más"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {modo === "fecha" && (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
              Fecha
              <input
                type="date"
                value={fechaElegida}
                onChange={(e) => buscarPorFecha(e.target.value)}
                className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
              />
            </label>

            {buscando && <p className="text-sm" style={{ color: "var(--gx-muted)" }}>Buscando...</p>}

            {!buscando && resultadoFecha?.tipo === "ENCONTRADA" && (
              <ListaHistorial filas={[resultadoFecha.tasa]} />
            )}

            {!buscando && resultadoFecha?.tipo === "NO_ENCONTRADA" && (
              <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--gx-edge)" }}>
                <p style={{ color: "var(--gx-muted)" }}>No hay tasa registrada para esa fecha.</p>
                {resultadoFecha.masCercanaAnterior ? (
                  <button
                    type="button"
                    onClick={() => setResultadoFecha({ tipo: "ENCONTRADA", tasa: resultadoFecha.masCercanaAnterior! })}
                    className="self-start rounded-lg border px-3 py-1.5 text-sm font-medium"
                    style={{ borderColor: "var(--gx-accent)", color: "var(--gx-accent)" }}
                  >
                    Ver la más cercana anterior
                  </button>
                ) : (
                  <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                    No hay ninguna tasa registrada hasta esa fecha.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
