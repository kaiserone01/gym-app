"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";

export function BarraUsuario({ nombre, email }: { nombre: string; email: string }) {
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
      <div>
        <p className="truncate font-medium text-neutral-800">{nombre}</p>
        <p className="truncate text-xs text-neutral-500">{email}</p>
      </div>
      <a href="/cambiar-password" className="text-xs font-medium text-blue-600 hover:underline">
        Cambiar contraseña
      </a>
      <Button variant="secundario" onClick={cerrarSesion} disabled={cargando}>
        {cargando ? "Cerrando..." : "Cerrar sesión"}
      </Button>
    </div>
  );
}
