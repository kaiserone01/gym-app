import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { FormularioUsuario } from "../FormularioUsuario";
import { crearUsuarioAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoUsuario() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  // Un SOCIO siempre tiene acceso total.
  const puedeCrear = usuario.rol === "SOCIO" || (await permisos.tiene(usuario.id, "USUARIOS", "CREAR"));
  if (!puedeCrear) redirect("/usuarios");

  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Nuevo usuario</PageHeader>
      </div>
      <FormularioUsuario accion={crearUsuarioAction} sucursales={sucursales} />
    </div>
  );
}
