"use client";

import { useEffect, useState } from "react";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";

export interface LineaPagoMiembro {
  monto: number;
  metodoPagoId: string | null;
  metodo: string;
  tasaCambio: number | null;
  numeroOperacion: string;
}

// Una de las líneas del primer pago dividido de un miembro nuevo: método de pago + monto en USD (y en Bs si el
// método es en bolívares: escribir en Bs recalcula el USD, que es la fuente de verdad).
export function LineaPagoMiembroCampos({
  nombre,
  titulo,
  metodosPago,
  idFormulario,
  fechaTasa,
  montoInicial,
  onCambio,
}: {
  nombre: string;
  titulo: string;
  metodosPago: MetodoPago[];
  idFormulario: string;
  fechaTasa?: string;
  montoInicial: string;
  onCambio: (linea: LineaPagoMiembro) => void;
}) {
  const [montoUSD, setMontoUSD] = useState(montoInicial);
  const [montoBs, setMontoBs] = useState("");
  const [seleccion, setSeleccion] = useState<Omit<LineaPagoMiembro, "monto">>({
    metodoPagoId: null,
    metodo: "",
    tasaCambio: null,
    numeroOperacion: "",
  });
  const tasa = seleccion.tasaCambio;

  useEffect(() => {
    onCambio({ monto: Number(montoUSD) || 0, ...seleccion });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCambio se reconstruye en cada render del padre
  }, [montoUSD, seleccion]);

  // Al elegir un método en Bs (o cambiar la tasa de la fecha) la casilla Bs se completa con el USD ya escrito.
  useEffect(() => {
    const numero = Number(montoUSD);
    setMontoBs(tasa !== null && montoUSD !== "" && !Number.isNaN(numero) ? String(numero * tasa) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a la tasa, no a cada cambio del monto
  }, [tasa]);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--gx-ink)" }}>
        {titulo}
      </p>
      <SelectorMetodoPago
        metodos={metodosPago}
        monto={Number(montoUSD) || 0}
        onCambio={(s) => setSeleccion({ metodoPagoId: s.metodoPagoId, metodo: s.metodo, tasaCambio: s.tasaCambio, numeroOperacion: s.numeroOperacion })}
        idFormulario={idFormulario}
        fechaTasa={fechaTasa}
      />
      <CurrencyInput
        name={`${nombre}USD`}
        label="Monto (USD)"
        moneda="USD"
        value={montoUSD}
        onChange={(valor) => {
          setMontoUSD(valor);
          const numero = Number(valor);
          if (tasa !== null) setMontoBs(valor === "" || Number.isNaN(numero) ? "" : String(numero * tasa));
        }}
      />
      {tasa !== null && (
        <CurrencyInput
          name={`${nombre}Bs`}
          label="Monto (Bs)"
          moneda="Bs"
          value={montoBs}
          onChange={(valorBs) => {
            setMontoBs(valorBs);
            const numero = Number(valorBs);
            setMontoUSD(valorBs === "" || Number.isNaN(numero) || tasa === 0 ? "" : String(numero / tasa));
          }}
        />
      )}
    </div>
  );
}
