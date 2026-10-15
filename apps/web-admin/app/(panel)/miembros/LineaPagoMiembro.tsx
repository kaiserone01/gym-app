"use client";

import { useEffect, useState } from "react";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { Button } from "@gym-app/ui/components/Button";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";

export interface LineaPagoMiembro {
  monto: number;
  // Bs tecleados (lo recibido de verdad), si el método es en bolívares.
  montoBs: number | null;
  metodoPagoId: string | null;
  metodo: string;
  tasaCambio: number | null;
  numeroOperacion: string;
}

const aCentavos = (numero: number) => String(Math.round(numero * 100) / 100);

// Una de las líneas del primer pago dividido de un miembro nuevo: método de pago + monto en USD (y en Bs si el
// método es en bolívares: escribir en Bs recalcula el USD, redondeado a centavos, y los Bs se guardan tal cual).
export function LineaPagoMiembroCampos({
  nombre,
  titulo,
  metodosPago,
  idFormulario,
  fechaTasa,
  onCambio,
  onQuitar,
}: {
  nombre: string;
  titulo: string;
  metodosPago: MetodoPago[];
  idFormulario: string;
  fechaTasa?: string;
  onCambio: (linea: LineaPagoMiembro) => void;
  // Solo cuando hay más de dos pagos: quita esta línea.
  onQuitar?: () => void;
}) {
  const [montoUSD, setMontoUSD] = useState("");
  const [montoBs, setMontoBs] = useState("");
  const [seleccion, setSeleccion] = useState<Omit<LineaPagoMiembro, "monto" | "montoBs">>({
    metodoPagoId: null,
    metodo: "",
    tasaCambio: null,
    numeroOperacion: "",
  });
  const tasa = seleccion.tasaCambio;

  useEffect(() => {
    onCambio({
      monto: Number(montoUSD) || 0,
      montoBs: tasa !== null && montoBs !== "" ? Number(montoBs) : null,
      ...seleccion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCambio se reconstruye en cada render del padre
  }, [montoUSD, montoBs, seleccion]);

  // Al elegir un método en Bs (o cambiar la tasa de la fecha) la casilla Bs se completa con el USD ya escrito.
  useEffect(() => {
    const numero = Number(montoUSD);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recalcula el monto en Bs solo al cambiar la tasa; el usuario puede editarlo despues, no es derivable
    setMontoBs(tasa !== null && montoUSD !== "" && !Number.isNaN(numero) ? aCentavos(numero * tasa) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a la tasa, no a cada cambio del monto
  }, [tasa]);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--gx-ink)" }}>
          {titulo}
        </p>
        {onQuitar && (
          <Button type="button" variant="secundario" onClick={onQuitar}>
            Quitar
          </Button>
        )}
      </div>
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
          if (tasa !== null) setMontoBs(valor === "" || Number.isNaN(numero) ? "" : aCentavos(numero * tasa));
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
            setMontoUSD(valorBs === "" || Number.isNaN(numero) || tasa === 0 ? "" : aCentavos(numero / tasa));
          }}
        />
      )}
    </div>
  );
}
