import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarUsuariosAdmin } from "@gym-app/domain/use-cases/ListarUsuariosAdmin";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

export default async function PaginaUsuarios() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeVer = await permisos.tiene(usuario.id, "USUARIOS", "VER");
  if (!puedeVer) redirect("/miembros");

  const puedeCrear = await permisos.tiene(usuario.id, "USUARIOS", "CREAR");
  const usuarios = await listarUsuariosAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        {puedeCrear && (
          <Link href="/usuarios/nuevo">
            <Button>Nuevo usuario</Button>
          </Link>
        )}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Email</th>
            <th className="py-2">Rol</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">{u.nombre || "—"}</td>
              <td className="py-2">{u.email}</td>
              <td className="py-2">{u.rol}</td>
              <td className="py-2">
                <Badge tono={u.activo ? "verde" : "gris"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
              </td>
              <td className="py-2">
                <Link href={`/usuarios/${u.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {usuarios.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-500">
                Todavía no hay usuarios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
