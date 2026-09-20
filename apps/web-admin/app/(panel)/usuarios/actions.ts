"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import {
  crearUsuarioAdmin,
  NoAutorizadoError,
  SucursalInvalidaError as SucursalInvalidaCrear,
} from "@gym-app/domain/use-cases/CrearUsuarioAdmin";
import {
  actualizarUsuarioAdmin,
  RolNoAutorizadoError as RolNoAutorizadoActualizar,
  UsuarioNoEncontradoError as UsuarioNoEncontradoActualizar,
  AutoDesactivacionError,
} from "@gym-app/domain/use-cases/ActualizarUsuarioAdmin";
import {
  asignarSucursalesAUsuario,
  RolNoAutorizadoError as RolNoAutorizadoSucursales,
  UsuarioNoEncontradoError as UsuarioNoEncontradoSucursales,
  SucursalInvalidaError as SucursalInvalidaAsignar,
} from "@gym-app/domain/use-cases/AsignarSucursalesAUsuario";
import {
  actualizarPermisosUsuario,
  RolNoAutorizadoError as RolNoAutorizadoPermisos,
  UsuarioNoEncontradoError as UsuarioNoEncontradoPermisos,
} from "@gym-app/domain/use-cases/ActualizarPermisosUsuario";
import type { ModuloPermiso, AccionPermiso } from "@gym-app/domain/entities/Permiso";
import type { RolUsuario } from "@gym-app/domain/entities/UsuarioAdmin";

export interface EstadoFormularioUsuario {
  error?: string;
}

const MODULOS: ModuloPermiso[] = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"];
const ACCIONES: AccionPermiso[] = ["VER", "CREAR", "EDITAR", "ELIMINAR"];

const SOLO_SOCIO = "Solo el socio puede administrar usuarios.";

/**
 * Las acciones que devuelven `void` están atadas a un `<form action={...}>` plano,
 * sin canal de `useActionState` donde reportar un error. Para no dejar que un error
 * de dominio escale a un 500 sin explicación, las envolvemos en try/catch y
 * redirigimos a la misma página con `?error=<mensaje>`, que la página renderiza
 * como banner (ver AvisoError). Cualquier error inesperado se re-lanza.
 */
function redirigirConError(ruta: string, mensaje: string): never {
  redirect(`${ruta}?error=${encodeURIComponent(mensaje)}`);
}

export async function crearUsuarioAction(
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  // Defensa en profundidad: el caso de uso ya lo valida, pero la Server Action
  // también (Restricción Global #1 del plan).
  if (usuario.rol !== "SOCIO") return { error: SOLO_SOCIO };

  const nombre = formData.get("nombre")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const rol = formData.get("rol")?.toString() as RolUsuario | undefined;
  const sucursalIds = formData.getAll("sucursalIds").map((v) => v.toString());

  if (!nombre || !email || !password || !rol) {
    return { error: "Nombre, email, contraseña y rol son requeridos." };
  }

  try {
    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash(password);

    await crearUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
        permisos: new PrismaPermisoRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
      },
      {
        solicitante: { rol: usuario.rol },
        organizacionId: usuario.organizacionId,
        // Sucursal por defecto solo si hay exactamente una seleccionada; con varias,
        // `null` = sin sucursal por defecto (sin scoping de turno en Caja).
        sucursalId: sucursalIds.length === 1 ? sucursalIds[0] : null,
        sucursalIds,
        nombre,
        email,
        passwordHash,
        rol,
      }
    );
  } catch (error) {
    if (error instanceof NoAutorizadoError || error instanceof SucursalInvalidaCrear) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function actualizarUsuarioAction(
  id: string,
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") return { error: SOLO_SOCIO };

  const nombre = formData.get("nombre")?.toString().trim();
  if (!nombre) {
    return { error: "El nombre es requerido." };
  }

  try {
    await actualizarUsuarioAdmin(
      { usuarios: new PrismaUsuarioAdminRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        rolSolicitante: usuario.rol,
        usuarioIdSolicitante: usuario.id,
        id,
        cambios: { nombre },
      }
    );
  } catch (error) {
    if (error instanceof RolNoAutorizadoActualizar || error instanceof UsuarioNoEncontradoActualizar) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/usuarios/${id}`);
  return {};
}

export async function actualizarSucursalesUsuarioAction(id: string, formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") redirigirConError(`/usuarios/${id}`, SOLO_SOCIO);

  const sucursalIds = formData.getAll("sucursalIds").map((v) => v.toString());

  try {
    await asignarSucursalesAUsuario(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
      },
      { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, usuarioId: id, sucursalIds }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoSucursales ||
      error instanceof UsuarioNoEncontradoSucursales ||
      error instanceof SucursalInvalidaAsignar
    ) {
      console.error("No se pudieron asignar las sucursales:", error);
      redirigirConError(`/usuarios/${id}`, error.message);
    }
    throw error;
  }

  revalidatePath(`/usuarios/${id}`);
}

export async function actualizarPermisosUsuarioAction(id: string, formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") redirigirConError(`/usuarios/${id}`, SOLO_SOCIO);

  const permisos = MODULOS.flatMap((modulo) =>
    ACCIONES.filter((accion) => formData.get(`permiso_${modulo}_${accion}`) === "on").map((accion) => ({
      modulo,
      accion,
    }))
  );

  try {
    await actualizarPermisosUsuario(
      { usuarios: new PrismaUsuarioAdminRepository(prisma), permisos: new PrismaPermisoRepository(prisma) },
      { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, usuarioId: id, permisos }
    );
  } catch (error) {
    if (error instanceof RolNoAutorizadoPermisos || error instanceof UsuarioNoEncontradoPermisos) {
      console.error("No se pudieron actualizar los permisos:", error);
      redirigirConError(`/usuarios/${id}`, error.message);
    }
    throw error;
  }

  revalidatePath(`/usuarios/${id}`);
}

async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") redirigirConError("/usuarios", SOLO_SOCIO);

  try {
    await actualizarUsuarioAdmin(
      { usuarios: new PrismaUsuarioAdminRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        rolSolicitante: usuario.rol,
        usuarioIdSolicitante: usuario.id,
        id,
        cambios: { activo },
      }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoActualizar ||
      error instanceof UsuarioNoEncontradoActualizar ||
      error instanceof AutoDesactivacionError
    ) {
      console.error("No se pudo cambiar el estado del usuario:", error);
      redirigirConError(`/usuarios/${id}`, error.message);
    }
    throw error;
  }

  revalidatePath("/usuarios");
}

export async function darDeBajaUsuarioAction(id: string): Promise<void> {
  await cambiarEstadoUsuario(id, false);
}

export async function reactivarUsuarioAction(id: string): Promise<void> {
  await cambiarEstadoUsuario(id, true);
}
