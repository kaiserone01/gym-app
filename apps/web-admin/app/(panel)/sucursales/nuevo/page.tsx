import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { FormularioSucursal } from "../FormularioSucursal";
import { crearSucursalAction } from "../actions";

export default async function PaginaNuevaSucursal() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  // Un DUEÑO siempre tiene acceso total.
  const puedeCrear = usuario.rol === "DUENO" || (await permisos.tiene(usuario.id, "SUCURSALES", "CREAR"));
  if (!puedeCrear) redirect("/sucursales");

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nueva sucursal</h1>
      <FormularioSucursal accion={crearSucursalAction} />
    </div>
  );
}
