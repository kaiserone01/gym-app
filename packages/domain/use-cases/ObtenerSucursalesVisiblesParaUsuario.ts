import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { SucursalResumen } from "../entities/SucursalResumen";
import { UsuarioAdmin } from "../entities/UsuarioAdmin";

// Las sucursales que un usuario puede ver/operar: SOCIO ve todas las de la
// organización; el resto de roles, solo las que tiene asignadas
// (UsuarioSucursal). Antes esta lógica estaba duplicada palabra por
// palabra en apps/web-admin (obtenerSucursalesVisiblesParaTurno en caja/ y
// obtenerSucursalesVisiblesParaMiembro en miembros/) — se consolida acá
// porque login también la necesita (ver plan de selección de sucursal al
// iniciar sesión) y domain no puede importar de apps/web-admin.
export async function obtenerSucursalesVisiblesParaUsuario(
  deps: { sucursales: ISucursalRepository; usuarioSucursales: IUsuarioSucursalRepository },
  usuario: UsuarioAdmin
): Promise<SucursalResumen[]> {
  const todas = await deps.sucursales.listarPorOrganizacion(usuario.organizacionId);

  if (usuario.rol === "SOCIO") {
    return todas;
  }

  const idsAsignados = new Set(await deps.usuarioSucursales.listarSucursalIdsPorUsuario(usuario.id));

  return todas.filter((sucursal) => idsAsignados.has(sucursal.id));
}
