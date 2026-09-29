"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import type { Producto } from "@gym-app/domain/entities/Producto";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import { ModalVenderProducto } from "./ModalVenderProducto";
import type { PlanParaModal } from "./SelectorMiembroModal";
import type { EstadoVenderProducto, EstadoFiarProducto } from "./actions";

export function BotonVenderProducto({
  accion,
  accionFiar,
  productos,
  metodosPago,
  tasaActual,
  miembros,
  planes,
}: {
  accion: (estado: EstadoVenderProducto, formData: FormData) => Promise<EstadoVenderProducto>;
  accionFiar: (estado: EstadoFiarProducto, formData: FormData) => Promise<EstadoFiarProducto>;
  productos: Producto[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  miembros: Miembro[];
  planes: PlanParaModal[];
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
          accionFiar={accionFiar}
          productos={productos}
          metodosPago={metodosPago}
          tasaActual={tasaActual}
          miembros={miembros}
          planes={planes}
          onCerrar={() => setModalAbierta(false)}
        />
      )}
    </>
  );
}
