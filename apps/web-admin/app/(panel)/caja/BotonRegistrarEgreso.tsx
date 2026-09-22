"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { ModalRegistrarEgreso } from "./ModalRegistrarEgreso";
import type { EstadoRegistrarEgreso } from "./actions";

export function BotonRegistrarEgreso({
  accion,
  turnoId,
}: {
  accion: (estado: EstadoRegistrarEgreso, formData: FormData) => Promise<EstadoRegistrarEgreso>;
  turnoId: string;
}) {
  const [modalAbierta, setModalAbierta] = useState(false);

  return (
    <>
      <Button variant="secundario" onClick={() => setModalAbierta(true)}>
        Registrar egreso
      </Button>
      {modalAbierta && (
        <ModalRegistrarEgreso accion={accion} turnoId={turnoId} onCerrar={() => setModalAbierta(false)} />
      )}
    </>
  );
}
