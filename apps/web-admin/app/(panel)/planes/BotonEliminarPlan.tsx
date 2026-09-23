"use client";

import { useTransition } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { eliminarPlanAction } from "./actions";

export function BotonEliminarPlan({ id, nombre }: { id: string; nombre: string }) {
  const [eliminando, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  function eliminar(evento: React.MouseEvent) {
    // Vive dentro de una fila/card que es un <Link> a la ficha del plan —
    // sin esto el clic también navegaría (mismo patrón que EstadoToggle en
    // Miembros y la papelera de TarjetaUsuario).
    evento.preventDefault();
    evento.stopPropagation();

    const confirmado = window.confirm(`¿Eliminar el plan "${nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmado) return;

    iniciarTransicion(async () => {
      try {
        await eliminarPlanAction(id);
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo eliminar el plan.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={eliminando}
      title="Eliminar plan"
      aria-label="Eliminar plan"
      className="shrink-0 rounded-lg p-2 transition-colors disabled:opacity-50"
      style={{ color: "var(--gx-bad)" }}
    >
      <Trash size={18} weight="bold" />
    </button>
  );
}
