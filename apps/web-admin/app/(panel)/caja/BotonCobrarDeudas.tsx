"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { ModalCobrarDeudas } from "./ModalCobrarDeudas";
import type { EstadoCobrarDeudas } from "./actions";

export function BotonCobrarDeudas({
  grupos,
  metodosPago,
  tasaActual,
  accionCobrar,
  accionAnular,
}: {
  grupos: GrupoDeudasMiembro[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  accionCobrar: (estado: EstadoCobrarDeudas, formData: FormData) => Promise<EstadoCobrarDeudas>;
  accionAnular: (id: string) => Promise<{ error?: string; ok?: string }>;
}) {
  const [modalAbierta, setModalAbierta] = useState(false);

  return (
    <>
      <Button variant="secundario" onClick={() => setModalAbierta(true)}>
        Cobrar deudas{grupos.length > 0 ? ` (${grupos.length})` : ""}
      </Button>
      {modalAbierta && (
        <ModalCobrarDeudas
          grupos={grupos}
          metodosPago={metodosPago}
          tasaActual={tasaActual}
          accionCobrar={accionCobrar}
          accionAnular={accionAnular}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
