import { IUsuarioAdminRepository } from "../ports/IUsuarioAdminRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { IPermisoRepository } from "../ports/IPermisoRepository";
import { IUsuarioSucursalRepository } from "../ports/IUsuarioSucursalRepository";
import { RolUsuario, UsuarioAdmin } from "../entities/UsuarioAdmin";
import { Permiso, ModuloPermiso, AccionPermiso } from "../entities/Permiso";

export interface CrearUsuarioAdminDeps {
  usuarios: IUsuarioAdminRepository;
  autorizacion: IAuthorizationService;
  permisos: IPermisoRepository;
  usuarioSucursales: IUsuarioSucursalRepository;
}

export interface CrearUsuarioAdminInput {
  solicitante: { rol: RolUsuario };
  organizacionId: string;
  sucursalId: string | null;
  sucursalIds: string[];
  nombre: string;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
}

export class NoAutorizadoError extends Error {
  constructor(rolSolicitante: RolUsuario, rolACrear: RolUsuario) {
    super(`El rol ${rolSolicitante} no puede crear usuarios con rol ${rolACrear}.`);
  }
}

const MODULOS: ModuloPermiso[] = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"];
const ACCIONES: AccionPermiso[] = ["VER", "CREAR", "EDITAR", "ELIMINAR"];

// Nota: esta matriz duplica deliberadamente la de packages/db/backfillPermisosYSucursales.ts
// (packages/db no puede importar de packages/domain sin invertir la dirección de dependencia).
// Si la matriz cambia, actualizar ambos lugares.
const PERMISOS_POR_ROL: Record<RolUsuario, Permiso[]> = {
  DUENO: MODULOS.flatMap((modulo) => ACCIONES.map((accion) => ({ modulo, accion }))),
  GERENTE: [
    ...(["MIEMBROS", "PAGOS", "CAJA"] as ModuloPermiso[]).flatMap((modulo) =>
      ACCIONES.map((accion) => ({ modulo, accion }))
    ),
    { modulo: "PLANES", accion: "VER" },
    { modulo: "PLANES", accion: "CREAR" },
    { modulo: "PLANES", accion: "EDITAR" },
    { modulo: "USUARIOS", accion: "VER" },
    { modulo: "SUCURSALES", accion: "VER" },
  ],
  RECEPCION: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "MIEMBROS", accion: "CREAR" },
    { modulo: "MIEMBROS", accion: "EDITAR" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PAGOS", accion: "CREAR" },
    { modulo: "PLANES", accion: "VER" },
    { modulo: "CAJA", accion: "VER" },
    { modulo: "CAJA", accion: "CREAR" },
  ],
  ENTRENADOR: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PLANES", accion: "VER" },
  ],
};

export async function crearUsuarioAdmin(
  deps: CrearUsuarioAdminDeps,
  input: CrearUsuarioAdminInput
): Promise<UsuarioAdmin> {
  if (!deps.autorizacion.puedeCrearUsuarioConRol(input.solicitante.rol, input.rol)) {
    throw new NoAutorizadoError(input.solicitante.rol, input.rol);
  }

  const creado = await deps.usuarios.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    nombre: input.nombre,
    email: input.email,
    passwordHash: input.passwordHash,
    rol: input.rol,
  });

  await deps.permisos.reemplazarTodos(creado.id, PERMISOS_POR_ROL[input.rol]);
  if (input.sucursalIds.length > 0) {
    await deps.usuarioSucursales.reemplazarTodas(creado.id, input.sucursalIds);
  }

  return creado;
}
