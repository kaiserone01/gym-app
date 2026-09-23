"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@gym-app/ui/components/Card";
import { Avatar } from "@gym-app/ui/components/Avatar";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";
import { eliminarUsuarioAction } from "./actions";

const ETIQUETA_ROL: Record<UsuarioAdmin["rol"], string> = {
  SOCIO: "Socio",
  GERENTE: "Gerente",
  RECEPCION: "Recepción",
  ENTRENADOR: "Entrenador",
};

export function TarjetaUsuario({ usuario, puedeEliminar }: { usuario: UsuarioAdmin; puedeEliminar: boolean }) {
  const [eliminando, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  function eliminar(evento: React.MouseEvent) {
    // La papelera vive dentro de una card que es un <Link> a la ficha del
    // usuario — sin esto el clic también navegaría (mismo problema que
    // EstadoToggle en Miembros).
    evento.preventDefault();
    evento.stopPropagation();

    const confirmado = window.confirm(
      `¿Eliminar a ${usuario.nombre || usuario.email}? Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    iniciarTransicion(async () => {
      try {
        await eliminarUsuarioAction(usuario.id);
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
      }
    });
  }

  return (
    <Link href={`/usuarios/${usuario.id}`}>
      <Card className="transition-transform active:scale-[0.98]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Avatar fotoUrl={usuario.fotoUrl} nombre={usuario.nombre || usuario.email} tamano={36} />
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {usuario.nombre || usuario.email}
            </span>
          </div>
          {puedeEliminar && (
            <button
              type="button"
              onClick={eliminar}
              disabled={eliminando}
              title="Eliminar usuario"
              aria-label="Eliminar usuario"
              className="shrink-0 rounded-lg p-2 transition-colors disabled:opacity-50"
              style={{ color: "var(--gx-bad)" }}
            >
              <Trash size={18} weight="bold" />
            </button>
          )}
        </div>
        <div className="mt-2 flex justify-between text-sm" style={{ color: "var(--gx-muted)" }}>
          <span>{usuario.email}</span>
          <span>{ETIQUETA_ROL[usuario.rol]}</span>
        </div>
      </Card>
    </Link>
  );
}
