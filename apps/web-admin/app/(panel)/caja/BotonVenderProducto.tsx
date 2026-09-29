"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import type { Producto } from "@gym-app/domain/entities/Producto";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { ModalVenderProducto } from "./ModalVenderProducto";
import type { EstadoVenderProducto } from "./actions";

export function BotonVenderProducto({
  accion,
  productos,
  metodosPago,
  tasaActual,
}: {
  accion: (estado: EstadoVenderProducto, formData: FormData) => Promise<EstadoVenderProducto>;
  productos: Producto[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
}) {
  const [modalAbierta, setModalAbierta] = useState(false);

  return (
    <>
      <Button variant="secundario" onClick={() => setModalAbierta(true)}>
        Vender producto
      </Button>
      {modalAbierta && (
        <ModalVenderProducto
          accion={accion}
          productos={productos}
          metodosPago={metodosPago}
          tasaActual={tasaActual}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
