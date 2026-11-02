"use client";

import { useState } from "react";
import { InputFecha } from "@gym-app/ui/components/InputFecha";
import { MAX_DIAS_ATRAS_PAGO_FECHADO } from "@gym-app/domain/entities/Pago";

export function fechaALocalISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

// Fecha de un cobro: arranca en hoy; una fecha pasada (hasta MAX_DIAS_ATRAS_PAGO_FECHADO) registra algo que ya se cobró y
// no se anotó: fuera de turno y con la tasa BCV de ese día. `esPasada` dice si hay que mandar la fecha al servidor.
export function useFechaCobro() {
  const hoyISO = fechaALocalISO(new Date());
  const [fecha, setFecha] = useState(hoyISO);
  return { fecha, setFecha, hoyISO, esPasada: fecha !== "" && fecha < hoyISO };
}

export function CampoFechaCobro({
  etiqueta,
  fecha,
  onChange,
  esPasada,
  mensajePasada,
  mensajeHoy,
}: {
  etiqueta: string;
  fecha: string;
  onChange: (fecha: string) => void;
  esPasada: boolean;
  mensajePasada: string;
  mensajeHoy: string;
}) {
  const hoyISO = fechaALocalISO(new Date());
  // eslint-disable-next-line react-hooks/purity -- el limite minimo debe calcularse con la hora actual en cada render
  const minISO = fechaALocalISO(new Date(Date.now() - MAX_DIAS_ATRAS_PAGO_FECHADO * 24 * 60 * 60 * 1000));
  return (
    <div
      className="etiquetas-blancas mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl border p-3"
      style={{ borderColor: "var(--gx-accent)" }}
    >
      <InputFecha label={etiqueta} value={fecha} min={minISO} max={hoyISO} onChange={onChange} className="tarjeta-luminosa" />
      <p className="text-sm font-medium" style={{ color: "#ffffff" }}>
        {esPasada ? mensajePasada : mensajeHoy}
      </p>
    </div>
  );
}
