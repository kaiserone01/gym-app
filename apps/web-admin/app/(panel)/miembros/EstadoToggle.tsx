"use client";

import { useState, useTransition } from "react";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { darDeBajaAction, reactivarAction } from "./actions";

export function EstadoToggle({ id, activo }: { id: string; activo: boolean }) {
  const [activoLocal, setActivoLocal] = useState(activo);
  const [pendiente, iniciarTransicion] = useTransition();
  const { mostrarExito, mostrarError } = useFeedback();

  function alternar(evento: React.MouseEvent) {
    // El switch puede vivir dentro de una card/fila que es un <Link> a la
    // ficha del miembro — sin esto, el clic también dispara la navegación.
    evento.preventDefault();
    evento.stopPropagation();

    if (activoLocal) {
      const confirmado = window.confirm(
        "¿Dar de baja a este miembro? Va a perder el acceso al gym hasta que lo reactives."
      );
      if (!confirmado) return;
    }

    const siguiente = !activoLocal;
    setActivoLocal(siguiente);

    iniciarTransicion(async () => {
      try {
        if (siguiente) {
          await reactivarAction(id);
          mostrarExito("Miembro reactivado.");
        } else {
          await darDeBajaAction(id);
          mostrarExito("Miembro dado de baja.");
        }
      } catch {
        setActivoLocal(!siguiente);
        mostrarError("No se pudo actualizar el estado del miembro.");
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
      title={activoLocal ? "Activo — clic para dar de baja" : "Inactivo — clic para reactivar"}
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
