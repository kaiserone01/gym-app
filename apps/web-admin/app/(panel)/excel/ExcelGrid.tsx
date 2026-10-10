"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { Button } from "@gym-app/ui/components/Button";
import type { HojaPadron } from "@gym-app/domain/entities/MiembroReferencia";
import { PALETA_RESALTADO, estaActivoEnPadron } from "@gym-app/domain/utils/padronExcel";
import { filtrarFilasPadron, type FiltrosFilasPadron } from "@gym-app/domain/utils/filtrarFilasPadron";
import { PRIMERA_FILA_DATOS, resolverSaltoFila } from "@gym-app/domain/utils/saltoFila";
import { activarActivosPadronAction, editarFilaPadronAction, resaltarFilaPadronAction } from "./actions";
import { COLUMNAS_GRID, HOJA_POR_DEFECTO, type FilaGrid } from "./tiposGrid";
import { ALTO_FILA, ANCHO_ESTADO, ANCHO_NUMERO, ESTILO_NUMERO, FilaHoja, HOJA, celdaBase, valorParaGuardar } from "./FilaHoja";
import { PanelFiltros } from "./PanelFiltros";

const LOTE_ACTIVACION = 20;
const BLOQUE = 150; // filas que se agregan cada vez que el final de la hoja entra en vista
const ALTO_LETRAS = 22;
const CAMPOS_FECHA = new Set(["fNacimiento", "fVenc", "fechaPago"]);

type Celda = { cedula: string; col: number };
type Desplazamiento = Celda & { centrar: boolean };

function hayFiltros(f: FiltrosFilasPadron): boolean {
  return Object.values(f).some((v) => v !== undefined && v !== "" && v !== "todos");
}

export function ExcelGrid({ filas: filasIniciales, hoja, puedeEditar }: { filas: FilaGrid[]; hoja: HojaPadron; puedeEditar: boolean }) {
  const { mostrarError } = useFeedback();
  const [filas, setFilas] = useState(filasIniciales);
  const [filtros, setFiltros] = useState<FiltrosFilasPadron>({});
  const [verFiltros, setVerFiltros] = useState(false);
  const [visibles, setVisibles] = useState(BLOQUE);
  const [seleccion, setSeleccion] = useState<Celda | null>(null);
  const [edicion, setEdicion] = useState<Celda | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [destacada, setDestacada] = useState<string | null>(null);
  const [paleta, setPaleta] = useState<{ cedula: string; x: number; y: number } | null>(null);
  const [pintando, setPintando] = useState(false);
  const [textoIr, setTextoIr] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [activando, setActivando] = useState<number | null>(null);

  const contenedor = useRef<HTMLDivElement>(null);
  const centinela = useRef<HTMLDivElement>(null);
  const refPaleta = useRef<HTMLDivElement>(null);
  const desplazamientoPendiente = useRef<Desplazamiento | null>(null);
  const temporizadorDestacado = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { anchos, titulos } = useMemo(() => {
    const porCol = new Map([...HOJA_POR_DEFECTO.encabezados, ...hoja.encabezados].map((e) => [e.col, e]));
    return {
      anchos: COLUMNAS_GRID.map(({ col }) => porCol.get(col)?.anchoPx || 80),
      titulos: COLUMNAS_GRID.map(({ col }) => hoja.encabezados.find((e) => e.col === col)?.titulo ?? ""),
    };
  }, [hoja]);
  const anchoTotal = ANCHO_NUMERO + anchos.reduce((a, b) => a + b, 0) + ANCHO_ESTADO;
  const altoTitulos = hoja.alturaEncabezadoPx || 28;
  const altoEncabezado = ALTO_LETRAS + altoTitulos;

  const filtrosAplicados = useDeferredValue(filtros);
  const filtradas = useMemo(() => filtrarFilasPadron(filas, filtrosAplicados), [filas, filtrosAplicados]);
  const mostradas = filtradas.slice(0, visibles);
  const numerosDeFila = useMemo(() => filas.map((f) => f.numeroFila).sort((a, b) => a - b), [filas]);
  const ultimaFila = numerosDeFila[numerosDeFila.length - 1] ?? PRIMERA_FILA_DATOS;
  const coloresPresentes = useMemo(() => [...new Set(filas.map((f) => f.resaltado).filter((c): c is string => c !== null))].sort(), [filas]);
  const filaSeleccionada = seleccion ? filas.find((f) => f.cedula === seleccion.cedula) ?? null : null;

  // Renderizado progresivo: al acercarse el centinela del final, se agregan BLOQUE filas más.
  useEffect(() => {
    const raiz = contenedor.current;
    const objetivo = centinela.current;
    if (!raiz || !objetivo) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) setVisibles((v) => v + BLOQUE);
    }, { root: raiz, rootMargin: "400px 0px" });
    observador.observe(objetivo);
    return () => observador.disconnect();
  }, [visibles, filtradas.length]);

  // Las filas miden siempre ALTO_FILA: la posición se calcula sin medir el DOM (content-visibility deja las lejanas sin pintar).
  useLayoutEffect(() => {
    const pendiente = desplazamientoPendiente.current;
    const c = contenedor.current;
    // Tras "Ir a fila" (que limpia los filtros) se espera a que el valor diferido se ponga al día: con la lista
    // filtrada vieja el índice, y por tanto el scroll, serían otros.
    if (!pendiente || !c || filtrosAplicados !== filtros) return;
    desplazamientoPendiente.current = null;
    const indice = mostradas.findIndex((f) => f.cedula === pendiente.cedula);
    if (indice === -1) return;
    const cuerpo = c.clientHeight - altoEncabezado;
    const arriba = indice * ALTO_FILA;
    if (pendiente.centrar) c.scrollTop = arriba - (cuerpo - ALTO_FILA) / 2;
    else if (arriba < c.scrollTop) c.scrollTop = arriba;
    else if (arriba + ALTO_FILA > c.scrollTop + cuerpo) c.scrollTop = arriba + ALTO_FILA - cuerpo;
    const izquierda = anchos.slice(0, pendiente.col).reduce((a, b) => a + b, 0);
    const derecha = ANCHO_NUMERO + izquierda + anchos[pendiente.col];
    if (izquierda < c.scrollLeft) c.scrollLeft = izquierda;
    else if (derecha > c.scrollLeft + c.clientWidth) c.scrollLeft = derecha - c.clientWidth;
  });

  useEffect(() => {
    if (!paleta) return;
    function alPresionarAfuera(e: MouseEvent) {
      if (!refPaleta.current?.contains(e.target as Node)) setPaleta(null);
    }
    function alTeclear(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setPaleta(null);
    }
    document.addEventListener("mousedown", alPresionarAfuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPresionarAfuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [paleta]);

  useEffect(() => () => {
    if (temporizadorDestacado.current) clearTimeout(temporizadorDestacado.current);
  }, []);

  const enfocarHoja = useCallback(() => contenedor.current?.focus({ preventScroll: true }), []);

  const reemplazarFila = useCallback((fila: FilaGrid) => setFilas((previas) => previas.map((f) => (f.cedula === fila.cedula ? fila : f))), []);

  const seleccionar = useCallback(
    (cedula: string, col: number) => {
      setSeleccion({ cedula, col });
      enfocarHoja();
    },
    [enfocarHoja]
  );

  const editar = useCallback((cedula: string, col: number) => {
    setSeleccion({ cedula, col });
    setEdicion({ cedula, col });
  }, []);

  const cancelar = useCallback(
    (devolverFoco: boolean) => {
      setEdicion(null);
      if (devolverFoco) enfocarHoja();
    },
    [enfocarHoja]
  );

  const guardar = useCallback(
    async (cedula: string, col: number, valor: string): Promise<boolean> => {
      const { campo } = COLUMNAS_GRID[col];
      setGuardando(true);
      try {
        const resultado = await editarFilaPadronAction(cedula, { [campo]: valorParaGuardar(valor, CAMPOS_FECHA.has(campo)) });
        if ("error" in resultado) {
          mostrarError(resultado.error); // sigue en edición
          return false;
        }
        reemplazarFila(resultado.fila);
        setEdicion(null);
        // Devuelve el foco a la hoja (para las flechas) salvo que el usuario ya se haya ido a otro control.
        const activo = document.activeElement;
        if (!activo || activo === document.body || contenedor.current?.contains(activo)) enfocarHoja();
        return true;
      } catch {
        mostrarError("No se pudo guardar el cambio.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [mostrarError, reemplazarFila, enfocarHoja]
  );

  const pendientesActivos = useMemo(() => filas.filter((f) => f.miembroId === null && estaActivoEnPadron(f.status)).map((f) => f.cedula), [filas]);

  async function activarActivos() {
    if (!window.confirm(`Se insertarán ${pendientesActivos.length} miembros con estatus activo en el listado, como "Por regularizar" y sin pago. ¿Continuar?`)) return;
    const pendientes = [...pendientesActivos];
    setActivando(0);
    let hechos = 0;
    try {
      for (let i = 0; i < pendientes.length; i += LOTE_ACTIVACION) {
        const resultado = await activarActivosPadronAction(pendientes.slice(i, i + LOTE_ACTIVACION));
        if ("error" in resultado) {
          mostrarError(resultado.error);
          break;
        }
        const idPorCedula = new Map(resultado.activados.map((a) => [a.cedula, a.miembroId]));
        setFilas((previas) => previas.map((f) => (idPorCedula.has(f.cedula) ? { ...f, miembroId: idPorCedula.get(f.cedula)! } : f)));
        hechos += resultado.activados.length;
        setActivando(hechos);
      }
    } catch {
      mostrarError("No se pudo activar a todos. Vuelve a intentarlo: los ya insertados no se duplican.");
    } finally {
      setActivando(null);
    }
    setAviso(`${hechos} miembros insertados.`);
  }

  const abrirPaleta = useCallback((cedula: string, ancla: HTMLElement) => {
    const r = ancla.getBoundingClientRect();
    setSeleccion({ cedula, col: 0 });
    setPaleta({ cedula, x: r.right + 4, y: Math.min(r.top, window.innerHeight - 56) });
  }, []);

  async function pintar(color: string | null) {
    if (!paleta) return;
    setPintando(true);
    try {
      const resultado = await resaltarFilaPadronAction(paleta.cedula, color);
      if ("error" in resultado) mostrarError(resultado.error);
      else {
        reemplazarFila(resultado.fila);
        setPaleta(null);
      }
    } catch {
      mostrarError("No se pudo cambiar el color de la fila.");
    } finally {
      setPintando(false);
    }
  }

  function cambiarFiltros(nuevos: FiltrosFilasPadron) {
    setFiltros(nuevos);
    setVisibles(BLOQUE);
    if (contenedor.current) contenedor.current.scrollTop = 0;
  }

  function irAFila() {
    const { destino, mensaje } = resolverSaltoFila(numerosDeFila, textoIr.trim() === "" ? Number.NaN : Number(textoIr));
    setAviso(mensaje);
    if (destino === null) return;
    // Sin filtros la fila queda en su posición dentro de `filas` (ordenadas por número de fila).
    const indice = filas.findIndex((f) => f.numeroFila === destino);
    const { cedula } = filas[indice];
    setFiltros({});
    setVisibles((v) => Math.max(v, Math.ceil((indice + 1) / BLOQUE) * BLOQUE));
    setSeleccion({ cedula, col: 0 });
    desplazamientoPendiente.current = { cedula, col: 0, centrar: true };
    setDestacada(cedula);
    if (temporizadorDestacado.current) clearTimeout(temporizadorDestacado.current);
    temporizadorDestacado.current = setTimeout(() => setDestacada(null), 1500);
    enfocarHoja();
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !seleccion) return;
    const indice = filtradas.findIndex((f) => f.cedula === seleccion.cedula);
    if (indice === -1) return;
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      const fila = filtradas[indice];
      if (puedeEditar && fila.miembroId === null && COLUMNAS_GRID[seleccion.col].editable) editar(fila.cedula, seleccion.col);
      return;
    }
    const movimientos: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const movimiento = movimientos[e.key];
    if (!movimiento) return;
    e.preventDefault();
    const nuevoIndice = Math.min(Math.max(indice + movimiento[0], 0), filtradas.length - 1);
    const col = Math.min(Math.max(seleccion.col + movimiento[1], 0), COLUMNAS_GRID.length - 1);
    const { cedula } = filtradas[nuevoIndice];
    if (nuevoIndice >= visibles) setVisibles(nuevoIndice + 1);
    setSeleccion({ cedula, col });
    desplazamientoPendiente.current = { cedula, col, centrar: false };
  }

  const encabezadoCelda = (ancho: number, extra: CSSProperties = {}): CSSProperties => ({
    ...celdaBase(ancho),
    background: HOJA.encabezado,
    color: HOJA.numero,
    textAlign: "center",
    ...extra,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-label="Celda seleccionada"
            className="flex h-9 w-20 shrink-0 items-center justify-center rounded-md border font-mono text-sm"
            style={{ background: "var(--gx-field-bg)", borderColor: "var(--gx-field-edge)", color: "var(--gx-ink)" }}
          >
            {seleccion && filaSeleccionada ? `${COLUMNAS_GRID[seleccion.col].col}${filaSeleccionada.numeroFila}` : ""}
          </span>
          <span
            aria-label="Contenido de la celda"
            className="flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-3 text-sm"
            style={{ background: "var(--gx-field-bg)", borderColor: "var(--gx-field-edge)", color: "var(--gx-ink)", whiteSpace: "pre" }}
          >
            {seleccion && filaSeleccionada ? filaSeleccionada[COLUMNAS_GRID[seleccion.col].campo] ?? "" : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              irAFila();
            }}
          >
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
              Ir a fila
              <input
                type="number"
                inputMode="numeric"
                min={PRIMERA_FILA_DATOS}
                max={ultimaFila}
                value={textoIr}
                onChange={(e) => {
                  setTextoIr(e.target.value);
                  setAviso(null);
                }}
                className="h-9 w-24 rounded-md border px-2 gx-campo"
              />
            </label>
            <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
              {PRIMERA_FILA_DATOS} – {ultimaFila}
            </span>
            <Button type="submit" variant="secundario" className="min-h-9" aria-label="Ir a la fila indicada">
              Ir
            </Button>
          </form>
          {puedeEditar && pendientesActivos.length > 0 && (
            <Button type="button" className="min-h-9" disabled={activando !== null} onClick={() => void activarActivos()}>
              {activando === null ? `Insertar ${pendientesActivos.length} activos en Miembros` : `Insertando… ${activando} de ${pendientesActivos.length + activando}`}
            </Button>
          )}
          <Button type="button" variant="secundario" className="min-h-9" aria-expanded={verFiltros} onClick={() => setVerFiltros((v) => !v)}>
            {hayFiltros(filtros) ? `Filtros · ${filtradas.length} de ${filas.length}` : "Filtros"}
          </Button>
        </div>
      </div>

      {aviso && (
        <p role="status" className="text-sm" style={{ color: "var(--gx-warn)" }}>
          {aviso}
        </p>
      )}

      {verFiltros && (
        <PanelFiltros filtros={filtros} onCambiar={cambiarFiltros} coloresPresentes={coloresPresentes} mostrando={filtradas.length} total={filas.length} />
      )}

      <div
        ref={contenedor}
        tabIndex={0}
        aria-label="Hoja del Excel"
        onKeyDown={alTeclear}
        onScroll={() => paleta && setPaleta(null)}
        className="overflow-auto rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#217346]"
        style={{
          maxHeight: "calc(100dvh - 220px)",
          minHeight: 320,
          background: HOJA.fondo,
          color: HOJA.texto,
          border: `1px solid ${HOJA.linea}`,
          fontFamily: HOJA.fuente,
          fontSize: 13,
        }}
      >
        <div style={{ width: anchoTotal }}>
          <div style={{ position: "sticky", top: 0, zIndex: 3 }}>
            <div style={{ display: "flex", height: ALTO_LETRAS }}>
              <div style={{ ...ESTILO_NUMERO, zIndex: 2, background: HOJA.encabezadoFuerte }} />
              {COLUMNAS_GRID.map(({ col }, i) => (
                <div
                  key={col}
                  style={encabezadoCelda(anchos[i], {
                    background: seleccion?.col === i ? "#d3e3d9" : HOJA.encabezadoFuerte,
                    color: seleccion?.col === i ? HOJA.seleccion : HOJA.numero,
                  })}
                >
                  {col}
                </div>
              ))}
              <div style={encabezadoCelda(ANCHO_ESTADO, { background: HOJA.estado })} />
            </div>
            <div style={{ display: "flex", height: altoTitulos }}>
              <div style={{ ...ESTILO_NUMERO, zIndex: 2, lineHeight: `${altoTitulos - 1}px` }}>3</div>
              {COLUMNAS_GRID.map(({ col }, i) => (
                <div key={col} style={encabezadoCelda(anchos[i], { color: HOJA.texto, fontWeight: 700, lineHeight: `${altoTitulos - 1}px` })}>
                  {titulos[i]}
                </div>
              ))}
              <div style={encabezadoCelda(ANCHO_ESTADO, { background: HOJA.estado, color: HOJA.texto, fontWeight: 700, lineHeight: `${altoTitulos - 1}px` })}>
                Estado en el sistema
              </div>
            </div>
          </div>

          {mostradas.map((fila) => {
            const esSeleccionada = seleccion?.cedula === fila.cedula;
            const esEditada = edicion?.cedula === fila.cedula;
            return (
              <FilaHoja
                key={fila.cedula}
                fila={fila}
                anchos={anchos}
                editable={puedeEditar && fila.miembroId === null}
                colSeleccionada={esSeleccionada ? seleccion.col : null}
                colEditando={esEditada ? edicion.col : null}
                guardando={esEditada && guardando}
                destacada={destacada === fila.cedula}
                onSeleccionar={seleccionar}
                onEditar={editar}
                onGuardar={guardar}
                onCancelar={cancelar}
                onClicNumero={abrirPaleta}
              />
            );
          })}
          {mostradas.length === 0 && <div style={{ padding: "24px 16px", color: HOJA.numero }}>Ninguna fila coincide con los filtros.</div>}
          {visibles < filtradas.length && <div ref={centinela} style={{ height: 1 }} />}
        </div>
      </div>

      {paleta && (
        <div
          ref={refPaleta}
          role="dialog"
          aria-label="Resaltar fila"
          className="fixed z-50 flex items-center gap-1.5 rounded-lg border p-2 shadow-lg"
          style={{ left: paleta.x, top: paleta.y, background: "var(--gx-surface-elevada)", borderColor: "var(--gx-edge)" }}
        >
          {PALETA_RESALTADO.map(({ nombre, hex }) => (
            <button
              key={hex}
              type="button"
              disabled={pintando}
              aria-label={`Resaltar en ${nombre}`}
              title={nombre}
              onClick={() => pintar(hex)}
              className="size-7 cursor-pointer rounded border disabled:cursor-wait"
              style={{ background: `#${hex}`, borderColor: "#00000033" }}
            />
          ))}
          <button
            type="button"
            disabled={pintando}
            aria-label="Quitar el color"
            onClick={() => pintar(null)}
            className="h-7 cursor-pointer rounded border px-2 text-xs disabled:cursor-wait"
            style={{ background: "#ffffff", color: "#222222", borderColor: "#00000033" }}
          >
            Sin color
          </button>
        </div>
      )}
    </div>
  );
}
