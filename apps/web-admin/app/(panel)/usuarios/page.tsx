import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarUsuariosAdmin } from "@gym-app/domain/use-cases/ListarUsuariosAdmin";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { Avatar } from "@gym-app/ui/components/Avatar";
import { AvisoError } from "../AvisoError";

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const esSocio = usuario.rol === "SOCIO";
  const permisos = new PrismaPermisoRepository(prisma);
  // Un SOCIO siempre tiene acceso total (no puede auto-bloquearse por permisos).
  const puedeVer = esSocio || (await permisos.tiene(usuario.id, "USUARIOS", "VER"));
  if (!puedeVer) redirect("/miembros");

  const { error: errorMensaje } = await searchParams;
  const puedeCrear = esSocio || (await permisos.tiene(usuario.id, "USUARIOS", "CREAR"));
  const usuarios = await listarUsuariosAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeader>Usuarios</PageHeader>
        {puedeCrear && (
          <Link href="/usuarios/nuevo">
            <Button>Nuevo usuario</Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <AvisoError mensaje={errorMensaje} />
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2"></th>
                <th className="py-2">Nombre</th>
                <th className="py-2">Email</th>
                <th className="py-2">Rol</th>
                <th className="py-2">Estado</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2">
                    <Avatar fotoUrl={u.fotoUrl} nombre={u.nombre || u.email} tamano={36} />
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {u.nombre || "—"}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {u.email}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {u.rol}
                  </td>
                  <td className="py-2">
                    <Badge tono={u.activo ? "verde" : "gris"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/usuarios/${u.id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: "var(--gx-accent)" }}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}

              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {usuarios.map((u) => (
          <Link key={u.id} href={`/usuarios/${u.id}`}>
            <Card className="transition-transform active:scale-[0.98]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar fotoUrl={u.fotoUrl} nombre={u.nombre || u.email} tamano={36} />
                  <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                    {u.nombre || u.email}
                  </span>
                </div>
                <Badge tono={u.activo ? "verde" : "gris"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
              </div>
              <div className="mt-2 flex justify-between text-sm" style={{ color: "var(--gx-muted)" }}>
                <span>{u.email}</span>
                <span>{u.rol}</span>
              </div>
            </Card>
          </Link>
        ))}

        {usuarios.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay usuarios.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
