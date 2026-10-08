"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { Badge } from "@gym-app/ui/components/Badge";
import { CAMPOS_EDITABLES_PADRON, type CambiosCrudosPadron, type CampoEditablePadron } from "@gym-app/domain/utils/padronExcel";
import { editarFilaPadronAction } from "./actions";

export interface FilaPadronSerializable {
  cedula: string;
  numeroFila: number;
  nombre: string;
  status: string | null;
  fNacimiento: string | null;
  celular: string | null;
  fVenc: string | null;
  fechaPago: string | null;
  plan: string | null;
  camposEditados: string[];
  miembroId: string | null;
}

type Borrador = Record<CampoEditablePadron, string>;

const CELDA = "py-2 pr-3";
const BOTON = "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const ESTILO_INPUT = { background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" };
const ESTILO_EDITADO = { background: "color-mix(in srgb, var(--gx-warn) 18%, transparent)" };
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function borradorDe(fila: FilaPadronSerializable): Borrador {
  return Object.fromEntries(CAMPOS_EDITABLES_PADRON.map((campo) => [campo, fila[campo] ?? ""])) as Borrador;
}

export function FilaPadronEditable({ fila, puedeEditar }: { fila: FilaPadronSerializable; puedeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(fila));
  const [guardando, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  const esMiembro = fila.miembroId !== null;
  const estiloCelda = (campo: CampoEditablePadron) => (fila.camposEditados.includes(campo) ? ESTILO_EDITADO : undefined);

  function empezar() {
    setBorrador(borradorDe(fila));
    setEditando(true);
  }

  function guardar() {
    const cambios: Record<string, string> = {};
    for (const campo of CAMPOS_EDITABLES_PADRON) {
      if (borrador[campo] !== (fila[campo] ?? "")) cambios[campo] = borrador[campo];
    }
    if (Object.keys(cambios).length === 0) {
      setEditando(false);
      return;
    }
    iniciarTransicion(async () => {
      try {
        await editarFilaPadronAction(fila.cedula, cambios as CambiosCrudosPadron);
        setEditando(false);
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo guardar el cambio.");
      }
    });
  }

  function celdaEditable(campo: CampoEditablePadron, etiqueta: string) {
    if (!editando) {
      return (
        <td className={CELDA} style={estiloCelda(campo)}>
          {fila[campo] || "—"}
        </td>
      );
    }
    const esCampoFecha = campo === "fNacimiento" || campo === "fVenc";
    const comoFecha = esCampoFecha && (fila[campo] === null || fila[campo] === "" || ES_FECHA.test(fila[campo]!));
    return (
      <td className={CELDA}>
        <input
          aria-label={etiqueta}
          type={comoFecha ? "date" : "text"}
          value={borrador[campo]}
          onChange={(e) => setBorrador((b) => ({ ...b, [campo]: e.target.value }))}
          disabled={guardando}
          className="min-h-9 w-full min-w-24 rounded-lg border px-2 text-sm outline-none focus:border-[var(--gx-accent)]"
          style={ESTILO_INPUT}
        />
      </td>
    );
  }

  return (
    <tr className="border-b align-top" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}>
      <td className={CELDA}>{fila.numeroFila}</td>
      <td className={CELDA}>{fila.cedula}</td>
      {celdaEditable("nombre", "Nombre")}
      {celdaEditable("status", "Status")}
      {celdaEditable("fNacimiento", "F. nacimiento")}
      {celdaEditable("celular", "Celular")}
      {celdaEditable("fVenc", "F. venc.")}
      {celdaEditable("fechaPago", "Fecha pago")}
      {celdaEditable("plan", "Plan")}
      <td className="py-2">
        <div className="flex flex-col items-start gap-1">
          {esMiembro ? (
            <>
              <Link href={`/miembros/${fila.miembroId}`} className="font-medium hover:underline" style={{ color: "var(--gx-accent)" }}>
                Ya es miembro
              </Link>
              <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Ajusta sus datos en la ficha del miembro
              </span>
            </>
          ) : (
            <span>No es miembro</span>
          )}
          {fila.camposEditados.length > 0 && <Badge tono="ambar">Editado: {fila.camposEditados.join(", ")}</Badge>}
          {puedeEditar && !esMiembro &&
            (editando ? (
              <div className="flex gap-2">
                <button type="button" onClick={guardar} disabled={guardando} className={BOTON} style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}>
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" onClick={() => setEditando(false)} disabled={guardando} className={BOTON} style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button" onClick={empezar} className={BOTON} style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}>
                Editar
              </button>
            ))}
        </div>
      </td>
    </tr>
  );
}
