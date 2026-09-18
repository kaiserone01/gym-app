"use client";

import { useActionState, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
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
  const [contados, setContados] = useState<Record<string, string>>({});

  function nombreMetodo(valor: string): string {
    return METODOS_PAGO.find((m) => m.value === valor)?.label ?? valor;
  }

  return (
    <form action={enviar} className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Arqueo de cierre</h2>

      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <input type="hidden" name="turnoId" value={turnoId} />

      {lineas.map((linea) => {
        const contado = contados[linea.metodo];
        const contadoNumero = Number(contado);
        const hayDiferencia = contado !== undefined && contado !== "" && contadoNumero !== linea.montoEsperado;

        return (
          <div key={linea.metodo} className="flex flex-col gap-2 border-b border-neutral-100 pb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-neutral-900">{nombreMetodo(linea.metodo)}</span>
              <span className="text-neutral-500">Esperado: {linea.montoEsperado.toFixed(2)}</span>
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

      <Button type="submit" disabled={enviando}>
        {enviando ? "Cerrando..." : "Cerrar turno"}
      </Button>
    </form>
  );
}
