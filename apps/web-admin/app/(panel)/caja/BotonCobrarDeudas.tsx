"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import type { AbonoPendiente } from "@gym-app/domain/use-cases/ListarAbonosPendientes";
import { ModalCobrarDeudas } from "./ModalCobrarDeudas";
import type { EstadoCobrarDeudas } from "./actions";

export function BotonCobrarDeudas({
  grupos,
  abonos,
  metodosPago,
  tasaActual,
  accionCobrar,
  accionAnular,
}: {
  grupos: GrupoDeudasMiembro[];
  abonos: AbonoPendiente[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  accionCobrar: (estado: EstadoCobrarDeudas, formData: FormData) => Promise<EstadoCobrarDeudas>;
  accionAnular: (id: string) => Promise<{ error?: string; ok?: string }>;
}) {
  const [modalAbierta, setModalAbierta] = useState(false);
  // Miembros distintos con algo pendiente (productos y/o saldo de membresía).
  const cuentas = new Set([...grupos.map((g) => g.miembroId), ...abonos.map((a) => a.miembroId)]).size;

  return (
    <>
      <Button variant="secundario" onClick={() => setModalAbierta(true)}>
        Cobrar deudas{cuentas > 0 ? ` (${cuentas})` : ""}
      </Button>
      {modalAbierta && (
        <ModalCobrarDeudas
          grupos={grupos}
          abonos={abonos}
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
