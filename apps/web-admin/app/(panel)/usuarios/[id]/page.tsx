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
} from "../actions";
import { Button } from "@gym-app/ui/components/Button";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { AvisoError } from "../../AvisoError";

export default async function PaginaEditarUsuario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario: usuarioSesion } = sesion;

  const permisos = new PrismaPermisoRepository(prisma);
  // Un SOCIO siempre tiene acceso total: nunca puede quedar bloqueado por la matriz
  // de permisos (ni siquiera si se quita a sí mismo USUARIOS/VER).
  const puedeVer = usuarioSesion.rol === "SOCIO" || (await permisos.tiene(usuarioSesion.id, "USUARIOS", "VER"));
  if (!puedeVer) redirect("/usuarios");

  const { id } = await params;
  const { error: errorMensaje } = await searchParams;

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
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      <PageHeader>Editar usuario</PageHeader>

      <AvisoError mensaje={errorMensaje} />

      <FormularioEditarUsuario
        accion={accionActualizar}
        nombreInicial={detalle.usuario.nombre}
        email={detalle.usuario.email}
        rol={detalle.usuario.rol}
        telefonoInicial={detalle.usuario.telefono}
        fotoUrlActual={detalle.usuario.fotoUrl}
      />

      <form action={accionSucursales} className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
          Sucursales asignadas
        </h2>
        {sucursales.map((sucursal) => (
          <label
            key={sucursal.id}
            className="flex min-h-11 items-center gap-2 text-sm"
            style={{ color: "var(--gx-muted)" }}
          >
            <input
              type="checkbox"
              name="sucursalIds"
              value={sucursal.id}
              defaultChecked={detalle.sucursalIds.includes(sucursal.id)}
              className="h-5 w-5 accent-[var(--gx-accent)]"
            />
            {sucursal.nombre}
          </label>
        ))}
        <Button type="submit">Guardar sucursales</Button>
      </form>

      {detalle.usuario.rol === "ENTRENADOR" ? (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          Los entrenadores no reciben permisos del panel — solo son seleccionables como entrenador en la ficha de un
          miembro.
        </p>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
            Permisos
          </h2>
          <FormularioPermisos accion={accionPermisos} permisosActuales={detalle.permisos} />
        </div>
      )}
    </div>
  );
}
