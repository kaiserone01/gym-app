import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { FormularioSucursal } from "../FormularioSucursal";
import { actualizarSucursalAction, darDeBajaSucursalAction, reactivarSucursalAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";
import { AvisoError } from "../../AvisoError";

export default async function PaginaEditarSucursal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const esDueno = usuario.rol === "DUENO";
  const permisos = new PrismaPermisoRepository(prisma);
  // Un DUEÑO siempre tiene acceso total.
  const puedeEditar = esDueno || (await permisos.tiene(usuario.id, "SUCURSALES", "EDITAR"));
  const puedeEliminar = esDueno || (await permisos.tiene(usuario.id, "SUCURSALES", "ELIMINAR"));
  // La página hospeda la edición (EDITAR) y el alta/baja (ELIMINAR): cualquiera de
  // los dos permisos da acceso, y cada bloque se muestra según el permiso concreto.
  if (!puedeEditar && !puedeEliminar) redirect("/sucursales");

  const { id } = await params;
  const { error: errorMensaje } = await searchParams;
  const sucursal = await new PrismaSucursalRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!sucursal) notFound();

  const accion = actualizarSucursalAction.bind(null, id);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar sucursal</h1>

      <div className="mb-4">
        <AvisoError mensaje={errorMensaje} />
      </div>

      <FormularioSucursal
        accion={accion}
        puedeGuardar={puedeEditar}
        valoresIniciales={{
          nombre: sucursal.nombre,
          direccion: sucursal.direccion,
          diasGracia: sucursal.diasGracia,
          apiKey: sucursal.apiKey,
        }}
      />

      {puedeEliminar && (
        <form action={sucursal.activo ? darDeBajaSucursalAction.bind(null, id) : reactivarSucursalAction.bind(null, id)} className="mt-4">
          <Button type="submit">{sucursal.activo ? "Dar de baja" : "Reactivar"}</Button>
        </form>
      )}
    </div>
  );
}
