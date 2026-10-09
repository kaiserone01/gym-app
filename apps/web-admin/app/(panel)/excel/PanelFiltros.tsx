"use client";

import { Input } from "@gym-app/ui/components/Input";
import { InputFecha } from "@gym-app/ui/components/InputFecha";
import { Button } from "@gym-app/ui/components/Button";
import { PALETA_RESALTADO } from "@gym-app/domain/utils/padronExcel";
import type { FiltrosFilasPadron } from "@gym-app/domain/utils/filtrarFilasPadron";

const SELECT_CLASE = "min-h-11 rounded-lg border px-3 gx-campo";

function nombreColor(hex: string): string {
  return PALETA_RESALTADO.find((c) => c.hex === hex)?.nombre ?? `#${hex}`;
}

export function PanelFiltros({
  filtros,
  onCambiar,
  coloresPresentes,
  mostrando,
  total,
}: {
  filtros: FiltrosFilasPadron;
  onCambiar: (filtros: FiltrosFilasPadron) => void;
  coloresPresentes: string[];
  mostrando: number;
  total: number;
}) {
  const fijar = <K extends keyof FiltrosFilasPadron>(clave: K, valor: FiltrosFilasPadron[K]) => onCambiar({ ...filtros, [clave]: valor });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Cédula" type="text" value={filtros.cedula ?? ""} onChange={(e) => fijar("cedula", e.target.value)} />
        <Input label="Nombre" type="text" value={filtros.nombre ?? ""} onChange={(e) => fijar("nombre", e.target.value)} />
        <Input label="Status" type="text" value={filtros.status ?? ""} onChange={(e) => fijar("status", e.target.value)} />
        <Input label="Plan" type="text" value={filtros.plan ?? ""} onChange={(e) => fijar("plan", e.target.value)} />
        <InputFecha label="Vence desde" value={filtros.venceDesde ?? ""} onChange={(iso) => fijar("venceDesde", iso)} />
        <InputFecha label="Vence hasta" value={filtros.venceHasta ?? ""} onChange={(iso) => fijar("venceHasta", iso)} />
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Estado
          <select
            value={filtros.estadoEnSistema ?? "todos"}
            onChange={(e) => fijar("estadoEnSistema", e.target.value as FiltrosFilasPadron["estadoEnSistema"])}
            className={SELECT_CLASE}
          >
            <option value="todos">Todos</option>
            <option value="no_miembro">No es miembro</option>
            <option value="miembro">Ya es miembro</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Color
          <select value={filtros.color ?? ""} onChange={(e) => fijar("color", e.target.value || undefined)} className={SELECT_CLASE}>
            <option value="">Todos</option>
            <option value="SIN">Sin color</option>
            {coloresPresentes.map((hex) => (
              <option key={hex} value={hex}>
                {nombreColor(hex)}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secundario" onClick={() => onCambiar({})}>
          Limpiar
        </Button>
      </div>
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Mostrando {mostrando} de {total} filas
      </p>
    </div>
  );
}
