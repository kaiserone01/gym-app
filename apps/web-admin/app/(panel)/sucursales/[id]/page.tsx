import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { FormularioSucursal } from "../FormularioSucursal";
import { actualizarSucursalAction, darDeBajaSucursalAction, reactivarSucursalAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarSucursal({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeEditar = await permisos.tiene(usuario.id, "SUCURSALES", "EDITAR");
  if (!puedeEditar) redirect("/sucursales");

  const { id } = await params;
  const sucursal = await new PrismaSucursalRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!sucursal) notFound();

  const accion = actualizarSucursalAction.bind(null, id);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar sucursal</h1>
      <FormularioSucursal
        accion={accion}
        valoresIniciales={{
          nombre: sucursal.nombre,
          direccion: sucursal.direccion,
          diasGracia: sucursal.diasGracia,
          apiKey: sucursal.apiKey,
        }}
      />

      <form action={sucursal.activo ? darDeBajaSucursalAction.bind(null, id) : reactivarSucursalAction.bind(null, id)} className="mt-4">
        <Button type="submit">{sucursal.activo ? "Dar de baja" : "Reactivar"}</Button>
      </form>
    </div>
  );
}
