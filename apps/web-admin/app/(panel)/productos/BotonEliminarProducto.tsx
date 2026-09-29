"use client";

import { useTransition } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { eliminarProductoAction } from "./actions";

export function BotonEliminarProducto({ id, nombre }: { id: string; nombre: string }) {
  const [eliminando, iniciarTransicion] = useTransition();
  const { mostrarError, mostrarExito } = useFeedback();

  function eliminar(evento: React.MouseEvent) {
    // Vive dentro de una card que es un <Link> a la edición — sin esto el
    // clic también navegaría (mismo patrón que BotonEliminarPlan).
    evento.preventDefault();
    evento.stopPropagation();

    if (!window.confirm(`¿Eliminar el producto "${nombre}"?`)) return;

    iniciarTransicion(async () => {
      try {
        mostrarExito(await eliminarProductoAction(id));
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={eliminando}
      title="Eliminar producto"
      aria-label="Eliminar producto"
      className="shrink-0 rounded-lg p-2 transition-colors disabled:opacity-50"
      style={{ color: "var(--gx-bad)" }}
    >
      <Trash size={18} weight="bold" />
    </button>
  );
}
