import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { obtenerUsuarioAdmin, UsuarioNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerUsuarioAdmin";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { FormularioPermisos } from "../FormularioPermisos";
import { FormularioEditarUsuario } from "../FormularioUsuario";
import {
  actualizarUsuarioAction,
  actualizarSucursalesUsuarioAction,
  actualizarPermisosUsuarioAction,
  darDeBajaUsuarioAction,
  reactivarUsuarioAction,
} from "../actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarUsuario({ params }: { params: Promise<{ id: string }> }) {
  const usuarioSesion = await obtenerUsuarioDeSesionActual();
  if (!usuarioSesion) redirect("/login");

  const permisos = new PrismaPermisoRepository(prisma);
  const puedeVer = await permisos.tiene(usuarioSesion.id, "USUARIOS", "VER");
  if (!puedeVer) redirect("/usuarios");

  const { id } = await params;

  let detalle;
  try {
    detalle = await obtenerUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
        permisos,
      },
      { organizacionId: usuarioSesion.organizacionId, id }
    );
  } catch (error) {
    if (error instanceof UsuarioNoEncontradoError) notFound();
    throw error;
  }

  const sucursales = await listarSucursales(
    { sucursales: new PrismaSucursalRepository(prisma) },
    usuarioSesion.organizacionId
  );

  const accionActualizar = actualizarUsuarioAction.bind(null, id);
  const accionSucursales = actualizarSucursalesUsuarioAction.bind(null, id);
  const accionPermisos = actualizarPermisosUsuarioAction.bind(null, id);

  return (
    <div className="flex flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Editar usuario</h1>

      <FormularioEditarUsuario
        accion={accionActualizar}
        nombreInicial={detalle.usuario.nombre}
        email={detalle.usuario.email}
        rol={detalle.usuario.rol}
      />

      <form action={accionSucursales} className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">Sucursales asignadas</h2>
        {sucursales.map((sucursal) => (
          <label key={sucursal.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              name="sucursalIds"
              value={sucursal.id}
              defaultChecked={detalle.sucursalIds.includes(sucursal.id)}
            />
            {sucursal.nombre}
          </label>
        ))}
        <Button type="submit">Guardar sucursales</Button>
      </form>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Permisos</h2>
        <FormularioPermisos accion={accionPermisos} permisosActuales={detalle.permisos} />
      </div>

      <form action={detalle.usuario.activo ? darDeBajaUsuarioAction.bind(null, id) : reactivarUsuarioAction.bind(null, id)}>
        <Button type="submit">{detalle.usuario.activo ? "Dar de baja" : "Reactivar"}</Button>
      </form>
    </div>
  );
}
