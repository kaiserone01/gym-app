"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { diasAPorcentaje, porcentajeADias, type TipoMinimoAbono } from "@gym-app/domain/entities/ReglaAbono";
import { DURACION_DIAS_POR_FRECUENCIA, type FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { EstadoReglaAbono } from "./actions";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  DIARIO: "Diario",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export function FormularioReglaAbono({
  frecuencia,
  valoresIniciales,
  accion,
}: {
  frecuencia: FrecuenciaPago;
  valoresIniciales: { activo: boolean; tipo: TipoMinimoAbono; valor: number } | null;
  accion: (estado: EstadoReglaAbono, formData: FormData) => Promise<EstadoReglaAbono>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const diasDelCiclo = DURACION_DIAS_POR_FRECUENCIA[frecuencia];

  const [activo, setActivo] = useState(valoresIniciales?.activo ?? false);
  const [tipo, setTipo] = useState<TipoMinimoAbono>(valoresIniciales?.tipo ?? "DIAS");
  const [valor, setValor] = useState(String(valoresIniciales?.valor ?? ""));

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  const [enviandoAnterior, setEnviandoAnterior] = useState(false);
  useEffect(() => {
    // Transición true → false sin error = el envío recién terminó bien —
    // mismo patrón usado en otros formularios de este proyecto para
    // mostrar éxito sin depender del timing de un action wrapper custom.
    if (enviandoAnterior && !enviando && !estado.error) {
      mostrarExito(`Regla de ${ETIQUETA_FRECUENCIA[frecuencia]} guardada.`);
    }
    setEnviandoAnterior(enviando);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a cambios de `enviando`, no a mostrarExito/frecuencia
  }, [enviando]);

  const valorNumerico = Number(valor) || 0;
  const equivalente =
    tipo === "DIAS"
      ? `≈ ${diasAPorcentaje(valorNumerico, diasDelCiclo).toFixed(0)}%`
      : `≈ ${porcentajeADias(valorNumerico, diasDelCiclo)} día(s)`;

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: "var(--gx-ink)" }}>
          {ETIQUETA_FRECUENCIA[frecuencia]}
        </h3>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
          <input
            type="checkbox"
            name="activo"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-5 w-5 accent-[var(--gx-accent)]"
          />
          Activo
        </label>
      </div>

      {activo && (
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Mínimo en
            <select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMinimoAbono)}
              className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              <option value="DIAS">Días</option>
              <option value="PORCENTAJE">Porcentaje</option>
            </select>
          </label>

          <Input
            name="valor"
            label={tipo === "DIAS" ? "Días mínimos" : "Porcentaje mínimo"}
            type="number"
            min={0}
            max={tipo === "PORCENTAJE" ? 100 : undefined}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />

          <span className="mb-2.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            {equivalente}
          </span>
        </div>
      )}

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
