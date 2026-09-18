import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

export default async function PaginaSucursales() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const esDueno = usuario.rol === "DUENO";
  const permisos = new PrismaPermisoRepository(prisma);
  // Un DUEÑO siempre tiene acceso total (no puede auto-bloquearse por permisos).
  const puedeVer = esDueno || (await permisos.tiene(usuario.id, "SUCURSALES", "VER"));
  if (!puedeVer) redirect("/miembros");

  const puedeCrear = esDueno || (await permisos.tiene(usuario.id, "SUCURSALES", "CREAR"));
  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sucursales</h1>
        {puedeCrear && (
          <Link href="/sucursales/nuevo">
            <Button>Nueva sucursal</Button>
          </Link>
        )}
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Dirección</th>
            <th className="py-2">Días de gracia</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sucursales.map((sucursal) => (
            <tr key={sucursal.id} className="border-b">
              <td className="py-2">{sucursal.nombre}</td>
              <td className="py-2">{sucursal.direccion || "—"}</td>
              <td className="py-2">{sucursal.diasGracia}</td>
              <td className="py-2">
                <Badge tono={sucursal.activo ? "verde" : "gris"}>
                  {sucursal.activo ? "Activa" : "Inactiva"}
                </Badge>
              </td>
              <td className="py-2">
                <Link href={`/sucursales/${sucursal.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {sucursales.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-500">
                Todavía no hay sucursales. Creá la primera.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
