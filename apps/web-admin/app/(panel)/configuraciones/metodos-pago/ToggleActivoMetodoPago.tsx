"use client";

import { useState, useTransition } from "react";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { alternarActivoMetodoPagoAction } from "../actions";

export function ToggleActivoMetodoPago({ id, activo }: { id: string; activo: boolean }) {
  const [activoLocal, setActivoLocal] = useState(activo);
  const [pendiente, iniciarTransicion] = useTransition();
  const { mostrarExito, mostrarError } = useFeedback();

  function alternar() {
    const siguiente = !activoLocal;
    setActivoLocal(siguiente);

    iniciarTransicion(async () => {
      try {
        await alternarActivoMetodoPagoAction(id, siguiente);
        mostrarExito(siguiente ? "Método de pago activado." : "Método de pago desactivado.");
      } catch {
        setActivoLocal(!siguiente);
        mostrarError("No se pudo actualizar el método de pago.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={pendiente}
      role="switch"
      aria-checked={activoLocal}
      title={activoLocal ? "Activo — clic para desactivar" : "Inactivo — clic para activar"}
      className="inline-flex h-7 w-12 shrink-0 items-center rounded-full border-0 p-0.5 shadow-inner outline-none transition-colors duration-150 disabled:opacity-50"
      style={{ background: activoLocal ? "var(--gx-good)" : "var(--gx-bad)" }}
    >
      <span
        className={`h-6 w-6 rounded-full shadow transition-transform duration-150 ${
          activoLocal ? "translate-x-5" : "translate-x-0"
        }`}
        style={{ background: activoLocal ? "var(--gx-good-ink)" : "var(--gx-bad-ink)" }}
      />
    </button>
  );
}
