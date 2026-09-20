"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoCerrarTurno } from "./actions";
import { METODOS_PAGO } from "../metodosPago";

export interface LineaEsperada {
  metodo: string;
  montoEsperado: number;
}

export function FormularioArqueo({
  accion,
  turnoId,
  lineas,
}: {
  accion: (estado: EstadoCerrarTurno, formData: FormData) => Promise<EstadoCerrarTurno>;
  turnoId: string;
  lineas: LineaEsperada[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) mostrarExito(estado.ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito
  }, [estado.ok]);

  const [contados, setContados] = useState<Record<string, string>>({});

  function nombreMetodo(valor: string): string {
    return METODOS_PAGO.find((m) => m.value === valor)?.label ?? valor;
  }

  return (
    <Card>
      <form action={enviar} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
          Arqueo de cierre
        </h2>

        {estado.error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
          >
            {estado.error}
          </p>
        )}

        <input type="hidden" name="turnoId" value={turnoId} />

        {lineas.map((linea) => {
          const contado = contados[linea.metodo];
          const contadoNumero = Number(contado);
          const hayDiferencia = contado !== undefined && contado !== "" && contadoNumero !== linea.montoEsperado;

          return (
            <div key={linea.metodo} className="flex flex-col gap-2 border-b pb-4" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {nombreMetodo(linea.metodo)}
                </span>
                <span style={{ color: "var(--gx-muted)" }}>Esperado: {linea.montoEsperado.toFixed(2)}</span>
              </div>
              <Input
                name={`montoContado_${linea.metodo}`}
                label="Monto contado"
                type="number"
                step="0.01"
                required
                value={contado ?? ""}
                onChange={(e) => setContados((prev) => ({ ...prev, [linea.metodo]: e.target.value }))}
              />
              {hayDiferencia && (
                <Input name={`nota_${linea.metodo}`} label="Nota (diferencia detectada, obligatoria)" required />
              )}
            </div>
          );
        })}

        <Button variant="peligro" type="submit" disabled={enviando}>
          {enviando ? "Cerrando..." : "Cerrar turno"}
        </Button>
      </form>
    </Card>
  );
}
