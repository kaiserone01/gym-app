"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { Card } from "@gym-app/ui/components/Card";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoCerrarTurno } from "./actions";
import { METODOS_PAGO } from "../metodosPago";
import { formatearBsConRef } from "../tasaBcvFija";

export interface LineaEsperada {
  metodo: string;
  // Si el método opera en Bs — viene de ObtenerResumenTurno.enBs, que lo
  // detecta desde las transacciones reales (Pago.montoBs, Egreso.moneda),
  // no del string del método (antes solo Efectivo (Bs) se reconocía,
  // dejando Punto de Venta/Pago Móvil/Transferencia/Biopago en Bs
  // mostrados como si fueran USD).
  enBs: boolean;
  montoEsperado: number;
  // Solo para líneas en Bs — referencia en USD del montoEsperado,
  // calculada en page.tsx (fondo a la tasa BCV vigente + pagos/egresos a
  // su propia tasa capturada, ver ObtenerResumenTurno). null si la línea
  // es en USD o si no hay tasa disponible para calcularla.
  refUSD?: number | null;
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

  // Atajo para el caso común (caja cuadrada): carga el monto esperado de
  // cada método como "contado". Si el usuario después edita alguno a mano,
  // hayDiferencia se recalcula normal contra montoEsperado y pide nota
  // como siempre — este botón solo prellena, no cambia esa validación.
  function usarMontosEsperados() {
    setContados(Object.fromEntries(lineas.map((linea) => [linea.metodo, String(linea.montoEsperado)])));
  }

  return (
    <Card>
      <form action={enviar} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
            Arqueo de cierre
          </h2>
          <Button type="button" onClick={usarMontosEsperados} className="min-h-9 px-3 py-1.5 text-xs">
            Usar montos esperados
          </Button>
        </div>

        {estado.error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
          >
            {estado.error}
          </p>
        )}

        <input type="hidden" name="turnoId" value={turnoId} />
        {/* Los nombres de método reales del turno (ej. "Efectivo (USD)",
            "Punto de Venta - Banesco") — cerrarTurnoAction los necesita
            para saber qué campos montoContado_* leer del FormData. Antes
            se adivinaban iterando un catálogo estático (METODOS_PAGO) que
            quedó desactualizado con códigos viejos (efectivo_usd, etc.),
            así que ningún campo coincidía y el arqueo se guardaba vacío
            aunque el operador sí hubiera escrito montos contados. */}
        {lineas.map((linea) => (
          <input key={linea.metodo} type="hidden" name="metodos" value={linea.metodo} />
        ))}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  <span style={{ color: "var(--gx-muted)" }}>
                    Esperado:{" "}
                    {linea.enBs
                      ? formatearBsConRef(linea.montoEsperado, linea.refUSD ?? null)
                      : `$${linea.montoEsperado.toFixed(2)}`}
                  </span>
                </div>
                <CurrencyInput
                  name={`montoContado_${linea.metodo}`}
                  label="Monto contado"
                  moneda={linea.enBs ? "Bs" : "USD"}
                  required
                  value={contado ?? ""}
                  onChange={(valor) => setContados((prev) => ({ ...prev, [linea.metodo]: valor }))}
                />
                {hayDiferencia && (
                  <Input name={`nota_${linea.metodo}`} label="Nota (diferencia detectada, obligatoria)" required />
                )}
              </div>
            );
          })}
        </div>

        <Button variant="peligro" type="submit" disabled={enviando}>
          {enviando ? "Cerrando..." : "Cerrar turno"}
        </Button>
      </form>
    </Card>
  );
}
