"use client";

import { useState } from "react";
import { RelojYTasa } from "@gym-app/ui/components/RelojYTasa";
import { ModalHistorialTasas } from "./ModalHistorialTasas";

export function RelojYTasaConHistorial() {
  const [modalAbierto, setModalAbierto] = useState(false);
  return (
    <>
      <RelojYTasa onClickTasa={() => setModalAbierto(true)} />
      {modalAbierto && <ModalHistorialTasas onCerrar={() => setModalAbierto(false)} />}
    </>
  );
}
