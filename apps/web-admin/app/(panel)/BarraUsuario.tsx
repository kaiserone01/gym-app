"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Avatar } from "@gym-app/ui/components/Avatar";

export function BarraUsuario({
  nombre,
  email,
  fotoUrl,
}: {
  nombre: string;
  email: string;
  fotoUrl?: string | null;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function cerrarSesion() {
    setCargando(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-3">
        <Avatar fotoUrl={fotoUrl} nombre={nombre || email} tamano={40} />
        <div className="min-w-0">
          <p className="truncate font-medium" style={{ color: "var(--gx-ink)" }}>
            {nombre}
          </p>
          <p className="truncate text-xs" style={{ color: "var(--gx-muted)" }}>
            {email}
          </p>
        </div>
      </div>
      <a
        href="/cambiar-password"
        className="text-xs font-medium hover:underline"
        style={{ color: "var(--gx-accent)" }}
      >
        Cambiar contraseña
      </a>
      <Button variant="secundario" onClick={cerrarSesion} disabled={cargando}>
        {cargando ? "Cerrando..." : "Cerrar sesión"}
      </Button>
    </div>
  );
}
