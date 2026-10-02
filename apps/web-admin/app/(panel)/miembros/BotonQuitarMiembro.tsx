"use client";

import { useTransition } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { eliminarMiembroAction } from "./actions";

export function BotonQuitarMiembro({ id, nombre, totalPagos }: { id: string; nombre: string; totalPagos: number }) {
  const [eliminando, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  function quitar() {
    const confirmado = window.confirm(
      `¿Quitar a "${nombre}" del sistema?\n\nSe borrarán también sus ${totalPagos} pago(s), suscripciones y check-ins. ` +
        "Esos pagos dejarán de contar en las cajas y reportes. Esta acción no se puede deshacer."
    );
    if (!confirmado) return;

    iniciarTransicion(async () => {
      try {
        await eliminarMiembroAction(id);
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo quitar al miembro.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={quitar}
      disabled={eliminando}
      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: "var(--gx-bad)", borderColor: "var(--gx-bad)" }}
    >
      <Trash size={16} weight="bold" />
      Quitar del sistema
    </button>
  );
}
