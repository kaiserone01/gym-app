"use client";

import { useState, useTransition } from "react";
import { darDeBajaAction, reactivarAction } from "./actions";

export function EstadoToggle({ id, activo }: { id: string; activo: boolean }) {
  const [activoLocal, setActivoLocal] = useState(activo);
  const [pendiente, iniciarTransicion] = useTransition();

  function alternar() {
    if (activoLocal) {
      const confirmado = window.confirm(
        "¿Dar de baja a este miembro? Va a perder el acceso al gym hasta que lo reactives."
      );
      if (!confirmado) return;
    }

    const siguiente = !activoLocal;
    setActivoLocal(siguiente);

    iniciarTransicion(async () => {
      if (siguiente) {
        await reactivarAction(id);
      } else {
        await darDeBajaAction(id);
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
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0 p-0.5 shadow-inner outline-none transition-colors disabled:opacity-50 ${
        activoLocal ? "bg-green-500" : "bg-red-500"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
          activoLocal ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
