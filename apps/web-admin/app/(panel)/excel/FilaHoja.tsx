"use client";

import { memo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatearCeldaPadron } from "@gym-app/domain/utils/formatoCeldaPadron";
import { COLUMNAS_GRID, type FilaGrid } from "./tiposGrid";

// Medidas y colores de la hoja: aspecto Excel claro, independiente del tema oscuro del panel.
export const ALTO_FILA = 22;
export const ANCHO_NUMERO = 52;
export const ANCHO_ESTADO = 320;
export const HOJA = {
  fondo: "#ffffff",
  texto: "#222222",
  linea: "#d0d0d0",
  encabezado: "#f0f0f0",
  encabezadoFuerte: "#e6e6e6",
  numero: "#6b6b6b",
  gris: "#8a8a8a",
  seleccion: "#217346",
  destacado: "#ffe699",
  estado: "#eef3fa",
  fuente: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
};

export function celdaBase(ancho: number): CSSProperties {
  return {
    width: ancho,
    minWidth: ancho,
    height: "100%",
    boxSizing: "border-box",
    borderRight: `1px solid ${HOJA.linea}`,
    borderBottom: `1px solid ${HOJA.linea}`,
    padding: "0 4px",
    overflow: "hidden",
    whiteSpace: "pre",
    textOverflow: "ellipsis",
    lineHeight: `${ALTO_FILA - 1}px`,
  };
}

export const ESTILO_NUMERO: CSSProperties = {
  ...celdaBase(ANCHO_NUMERO),
  position: "sticky",
  left: 0,
  zIndex: 1,
  textAlign: "center",
  background: HOJA.encabezado,
  color: HOJA.numero,
};

// Fechas dd/mm/aaaa (lo que se ve) se envían como aaaa-mm-dd, que el dominio acepta y la celda vuelve a mostrar igual.
export function valorParaGuardar(texto: string, esFecha: boolean): string {
  const dmy = esFecha ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim()) : null;
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : texto;
}

function EditorCelda({ inicial, guardando, onGuardar, onCancelar }: { inicial: string; guardando: boolean; onGuardar: (valor: string) => void; onCancelar: (devolverFoco: boolean) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <input
      autoFocus
      aria-label="Editar celda"
      value={valor}
      readOnly={guardando}
      onChange={(e) => setValor(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          if (guardando) return;
          if (valor === inicial) onCancelar(true);
          else onGuardar(valor);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancelar(true);
        }
      }}
      onBlur={() => onCancelar(false)}
      style={{ width: "100%", height: "100%", border: "none", outline: "none", padding: 0, font: "inherit", color: "inherit", background: "transparent" }}
    />
  );
}

interface PropsFilaHoja {
  fila: FilaGrid;
  anchos: number[]; // A–K
  editable: boolean; // puedeEditar y aún no es miembro
  colSeleccionada: number | null;
  colEditando: number | null;
  guardando: boolean;
  destacada: boolean;
  onSeleccionar: (cedula: string, col: number) => void;
  onEditar: (cedula: string, col: number) => void;
  onGuardar: (cedula: string, col: number, valor: string) => void;
  onCancelar: (devolverFoco: boolean) => void;
  onClicNumero: (cedula: string, ancla: HTMLElement) => void;
}

// Memo: editar o seleccionar una celda solo vuelve a pintar las filas afectadas, no las ~1400.
export const FilaHoja = memo(function FilaHoja({
  fila,
  anchos,
  editable,
  colSeleccionada,
  colEditando,
  guardando,
  destacada,
  onSeleccionar,
  onEditar,
  onGuardar,
  onCancelar,
  onClicNumero,
}: PropsFilaHoja) {
  const esMiembro = fila.miembroId !== null;
  const relleno = destacada ? HOJA.destacado : fila.resaltado ? `#${fila.resaltado}` : HOJA.fondo;

  return (
    <div style={{ display: "flex", height: ALTO_FILA, contentVisibility: "auto", containIntrinsicSize: `auto ${ALTO_FILA}px` }}
    >
      <div
        style={{ ...ESTILO_NUMERO, cursor: editable ? "pointer" : "default" }}
        title={editable ? "Resaltar la fila" : undefined}
        onClick={(e) => editable && onClicNumero(fila.cedula, e.currentTarget)}
      >
        {fila.numeroFila}
      </div>
      {COLUMNAS_GRID.map(({ col, campo, editable: columnaEditable }, i) => {
        const crudo = fila[campo];
        const estilo = fila.estilos?.[col];
        const seleccionada = colSeleccionada === i;
        return (
          <div
            key={col}
            onClick={() => colEditando !== i && onSeleccionar(fila.cedula, i)}
            onDoubleClick={() => editable && columnaEditable && onEditar(fila.cedula, i)}
            title={fila.camposEditados.includes(campo) ? "Editado a mano" : undefined}
            style={{
              ...celdaBase(anchos[i]),
              position: "relative",
              background: relleno,
              transition: "background-color 0.4s",
              color: esMiembro ? HOJA.gris : estilo?.c ? `#${estilo.c}` : HOJA.texto,
              fontWeight: estilo?.b ? 700 : 400,
              textAlign: estilo?.a ?? "left",
              boxShadow: seleccionada ? `inset 0 0 0 2px ${HOJA.seleccion}` : undefined,
              cursor: "cell",
            }}
          >
            {colEditando === i ? (
              <EditorCelda inicial={crudo ?? ""} guardando={guardando} onGuardar={(valor) => onGuardar(fila.cedula, i, valor)} onCancelar={onCancelar} />
            ) : (
              formatearCeldaPadron(crudo)
            )}
            {fila.camposEditados.includes(campo) && (
              <span aria-hidden style={{ position: "absolute", top: 0, right: 0, borderTop: "6px solid #c55a11", borderLeft: "6px solid transparent" }} />
            )}
          </div>
        );
      })}
      <div style={{ ...celdaBase(ANCHO_ESTADO), background: HOJA.estado, color: HOJA.texto }}>
        {esMiembro ? (
          <>
            <Link href={`/miembros/${fila.miembroId}`} className="font-semibold hover:underline" style={{ color: HOJA.seleccion }}>
              Ya es miembro → ficha
            </Link>
            <span style={{ color: HOJA.gris }}> · Ajusta sus datos en la ficha</span>
          </>
        ) : (
          "No es miembro"
        )}
      </div>
    </div>
  );
});
