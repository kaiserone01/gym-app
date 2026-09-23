import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarUsuariosAdmin } from "@gym-app/domain/use-cases/ListarUsuariosAdmin";
import { Card } from "@gym-app/ui/components/Card";
import { AvisoError } from "../AvisoError";
import { TarjetaUsuario } from "./TarjetaUsuario";

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const esSocio = usuario.rol === "SOCIO";
  const permisos = new PrismaPermisoRepository(prisma);
  // Un SOCIO siempre tiene acceso total (no puede auto-bloquearse por permisos).
  const puedeVer = esSocio || (await permisos.tiene(usuario.id, "USUARIOS", "VER"));
  if (!puedeVer) redirect("/miembros");

  const { error: errorMensaje } = await searchParams;
  const usuarios = await listarUsuariosAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    usuario.organizacionId
  );

  // Separados para no confundir entrenadores (sin acceso al panel, ver
  // ficha de usuario) con el personal que sí lo opera.
  const personal = usuarios.filter((u) => u.rol !== "ENTRENADOR");
  const entrenadores = usuarios.filter((u) => u.rol === "ENTRENADOR");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <AvisoError mensaje={errorMensaje} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Socios, gerentes y recepción
          </h2>
          {personal.map((u) => (
            <TarjetaUsuario key={u.id} usuario={u} puedeEliminar={esSocio} />
          ))}
          {personal.length === 0 && (
            <Card>
              <p className="text-center" style={{ color: "var(--gx-muted)" }}>
                Todavía no hay usuarios de este tipo.
              </p>
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Entrenadores
          </h2>
          {entrenadores.map((u) => (
            <TarjetaUsuario key={u.id} usuario={u} puedeEliminar={esSocio} />
          ))}
          {entrenadores.length === 0 && (
            <Card>
              <p className="text-center" style={{ color: "var(--gx-muted)" }}>
                Todavía no hay entrenadores.
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
