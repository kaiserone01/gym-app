"use client";

import { useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { ReglaAbonoPorFrecuencia } from "@gym-app/domain/entities/ReglaAbono";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";
import { Button } from "@gym-app/ui/components/Button";
import { ModalRegistrarPagoCaja } from "./ModalRegistrarPagoCaja";
import type { PlanParaModal } from "./SelectorMiembroModal";
import type { EstadoCambioPlan } from "../pagos/actions";

export function BotonRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
  reglasAbono,
  entrenadores,
  accionCambiarPlan,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  reglasAbono: ReglaAbonoPorFrecuencia[];
  // Entrenadores de la sucursal activa — para "Cambiar plan" en el Paso 2
  // (ver diseño acordado), solo se muestra el selector si el plan nuevo
  // elegido incluye entrenador.
  entrenadores: EntrenadorResumen[];
  accionCambiarPlan: (estado: EstadoCambioPlan, formData: FormData) => Promise<EstadoCambioPlan>;
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
          reglasAbono={reglasAbono}
          entrenadores={entrenadores}
          accionCambiarPlan={accionCambiarPlan}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
