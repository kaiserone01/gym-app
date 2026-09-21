import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { FormularioSucursal } from "../FormularioSucursal";
import { crearSucursalAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevaSucursal() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const permisos = new PrismaPermisoRepository(prisma);
  // Un SOCIO siempre tiene acceso total.
  const puedeCrear = usuario.rol === "SOCIO" || (await permisos.tiene(usuario.id, "SUCURSALES", "CREAR"));
  if (!puedeCrear) redirect("/sucursales");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Nueva sucursal</PageHeader>
      </div>
      <FormularioSucursal accion={crearSucursalAction} />
    </div>
  );
}
