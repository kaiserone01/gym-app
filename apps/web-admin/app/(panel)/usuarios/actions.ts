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
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";
import {
  actualizarUsuarioAdmin,
  RolNoAutorizadoError as RolNoAutorizadoActualizar,
  UsuarioNoEncontradoError as UsuarioNoEncontradoActualizar,
} from "@gym-app/domain/use-cases/ActualizarUsuarioAdmin";
import {
  asignarSucursalesAUsuario,
  RolNoAutorizadoError as RolNoAutorizadoSucursales,
} from "@gym-app/domain/use-cases/AsignarSucursalesAUsuario";
import {
  actualizarPermisosUsuario,
  RolNoAutorizadoError as RolNoAutorizadoPermisos,
} from "@gym-app/domain/use-cases/ActualizarPermisosUsuario";
import type { ModuloPermiso, AccionPermiso } from "@gym-app/domain/entities/Permiso";
import type { RolUsuario } from "@gym-app/domain/entities/UsuarioAdmin";

export interface EstadoFormularioUsuario {
  error?: string;
}

const MODULOS: ModuloPermiso[] = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"];
const ACCIONES: AccionPermiso[] = ["VER", "CREAR", "EDITAR", "ELIMINAR"];

export async function crearUsuarioAction(
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

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
      },
      {
        solicitante: { rol: usuario.rol },
        organizacionId: usuario.organizacionId,
        sucursalId: sucursalIds[0] ?? null,
        sucursalIds,
        nombre,
        email,
        passwordHash,
        rol,
      }
    );
  } catch (error) {
    if (error instanceof NoAutorizadoError) {
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

  const nombre = formData.get("nombre")?.toString().trim();
  if (!nombre) {
    return { error: "El nombre es requerido." };
  }

  try {
    await actualizarUsuarioAdmin(
      { usuarios: new PrismaUsuarioAdminRepository(prisma) },
      { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, id, cambios: { nombre } }
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

  const sucursalIds = formData.getAll("sucursalIds").map((v) => v.toString());

  await asignarSucursalesAUsuario(
    { usuarios: new PrismaUsuarioAdminRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, usuarioId: id, sucursalIds }
  );

  revalidatePath(`/usuarios/${id}`);
}

export async function actualizarPermisosUsuarioAction(id: string, formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const permisos = MODULOS.flatMap((modulo) =>
    ACCIONES.filter((accion) => formData.get(`permiso_${modulo}_${accion}`) === "on").map((accion) => ({
      modulo,
      accion,
    }))
  );

  await actualizarPermisosUsuario(
    { usuarios: new PrismaUsuarioAdminRepository(prisma), permisos: new PrismaPermisoRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, usuarioId: id, permisos }
  );

  revalidatePath(`/usuarios/${id}`);
}

export async function darDeBajaUsuarioAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarUsuarioAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, id, cambios: { activo: false } }
  );

  revalidatePath("/usuarios");
}

export async function reactivarUsuarioAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarUsuarioAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    { organizacionId: usuario.organizacionId, rolSolicitante: usuario.rol, id, cambios: { activo: true } }
  );

  revalidatePath("/usuarios");
}
