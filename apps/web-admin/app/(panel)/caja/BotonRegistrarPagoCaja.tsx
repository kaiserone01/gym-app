"use client";

import { useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { Button } from "@gym-app/ui/components/Button";
import { ModalRegistrarPagoCaja } from "./ModalRegistrarPagoCaja";
import type { PlanParaModal } from "./SelectorMiembroModal";

export function BotonRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
}) {
  const [modalAbierta, setModalAbierta] = useState(false);

  return (
    <>
      <Button onClick={() => setModalAbierta(true)}>Registrar pago</Button>
      {modalAbierta && (
        <ModalRegistrarPagoCaja
          miembros={miembros}
          planes={planes}
          metodosPago={metodosPago}
          tasaActual={tasaActual}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
