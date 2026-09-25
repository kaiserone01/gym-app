"use server";

import { randomUUID } from "crypto";
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
import { R2StorageService } from "@gym-app/infrastructure/storage/R2StorageService";
import {
  crearUsuarioAdmin,
  NoAutorizadoError,
  SucursalInvalidaError as SucursalInvalidaCrear,
} from "@gym-app/domain/use-cases/CrearUsuarioAdmin";
import {
  actualizarUsuarioAdmin,
  RolNoAutorizadoError as RolNoAutorizadoActualizar,
  UsuarioNoEncontradoError as UsuarioNoEncontradoActualizar,
} from "@gym-app/domain/use-cases/ActualizarUsuarioAdmin";
import { eliminarUsuarioAdmin } from "@gym-app/domain/use-cases/EliminarUsuarioAdmin";
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
  RolSinPermisosError,
} from "@gym-app/domain/use-cases/ActualizarPermisosUsuario";
import type { ModuloPermiso, AccionPermiso } from "@gym-app/domain/entities/Permiso";
import type { RolUsuario } from "@gym-app/domain/entities/UsuarioAdmin";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioUsuario {
  error?: string;
  // Solo se completa cuando la acción NO redirige (actualizarUsuarioAction
  // se queda en la misma página) — ver mismo patrón en pagos/actions.ts.
  ok?: string;
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

function redirigirConOk(ruta: string, mensaje: string): never {
  redirect(conMensajeOk(ruta, mensaje));
}

function storageR2(): R2StorageService {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      "Faltan variables de entorno de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)."
    );
  }

  return new R2StorageService({ accountId, accessKeyId, secretAccessKey, bucket, publicUrl });
}

// Sube la foto al bucket "gym-app" en Cloudflare R2 (carpeta "usuarios") y
// devuelve la URL pública. Mismo patrón que la foto de Miembro.
async function guardarFoto(archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const nombreArchivo = `${randomUUID()}.${extension}`;
  const contenido = Buffer.from(await archivo.arrayBuffer());

  return storageR2().subir("usuarios", nombreArchivo, contenido, archivo.type || "application/octet-stream");
}

export async function crearUsuarioAction(
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;
  // Defensa en profundidad: el caso de uso ya lo valida, pero la Server Action
  // también (Restricción Global #1 del plan).
  if (usuario.rol !== "SOCIO") return { error: SOLO_SOCIO };

  const nombre = formData.get("nombre")?.toString().trim();
  const rol = formData.get("rol")?.toString() as RolUsuario | undefined;
  // Un entrenador no tiene acceso al sistema administrativo (ver diseño
  // acordado) — el formulario no le pide email/contraseña, así que acá se
  // generan credenciales internas únicas e inutilizables: el email no es
  // uno real (nadie lo conoce) y la contraseña aleatoria se hashea y se
  // descarta sin guardarla en texto plano ni mostrarla en ningún lado —
  // la cuenta existe (sigue siendo un UsuarioAdmin, requerido por el
  // esquema) pero nadie puede loguearse con ella.
  const email =
    rol === "ENTRENADOR"
      ? `entrenador-${randomUUID()}@sinacceso.interno`
      : formData.get("email")?.toString().trim();
  const password = rol === "ENTRENADOR" ? randomUUID() : formData.get("password")?.toString();
  const sucursalIds = formData.getAll("sucursalIds").map((v) => v.toString());

  if (!nombre || !email || !password || !rol) {
    return { error: "Nombre, email, contraseña y rol son requeridos." };
  }

  const telefono = formData.get("telefono")?.toString().trim() || null;
  const fotoUrl = await guardarFoto(formData.get("foto"));

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
        telefono,
        fotoUrl,
      }
    );
  } catch (error) {
    if (error instanceof NoAutorizadoError || error instanceof SucursalInvalidaCrear) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/usuarios");
  redirect(conMensajeOk("/usuarios", "Usuario creado."));
}

export async function actualizarUsuarioAction(
  id: string,
  _estadoPrevio: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;
  if (usuario.rol !== "SOCIO") return { error: SOLO_SOCIO };

  const nombre = formData.get("nombre")?.toString().trim();
  if (!nombre) {
    return { error: "El nombre es requerido." };
  }

  const telefono = formData.get("telefono")?.toString().trim() || null;
  const fotoUrl = await guardarFoto(formData.get("foto"));

  try {
    await actualizarUsuarioAdmin(
      { usuarios: new PrismaUsuarioAdminRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        rolSolicitante: usuario.rol,
        usuarioIdSolicitante: usuario.id,
        id,
        cambios: { nombre, telefono, ...(fotoUrl ? { fotoUrl } : {}) },
      }
    );
  } catch (error) {
    if (error instanceof RolNoAutorizadoActualizar || error instanceof UsuarioNoEncontradoActualizar) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/usuarios/${id}`);
  return { ok: "Cambios guardados." };
}

export async function actualizarSucursalesUsuarioAction(id: string, formData: FormData): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;
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
  redirigirConOk(`/usuarios/${id}`, "Sucursales actualizadas.");
}

export async function actualizarPermisosUsuarioAction(id: string, formData: FormData): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;
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
    if (
      error instanceof RolNoAutorizadoPermisos ||
      error instanceof UsuarioNoEncontradoPermisos ||
      error instanceof RolSinPermisosError
    ) {
      console.error("No se pudieron actualizar los permisos:", error);
      redirigirConError(`/usuarios/${id}`, error.message);
    }
    throw error;
  }

  revalidatePath(`/usuarios/${id}`);
  redirigirConOk(`/usuarios/${id}`, "Permisos actualizados.");
}

// Sin redirect adentro a propósito: se llama desde un botón en el cliente
// (papelera en la tarjeta del usuario), no desde un <form action>, así que
// el error de dominio (mensaje en español, ya legible) se deja propagar
// para que el cliente lo muestre con useFeedback en vez de navegar.
export async function eliminarUsuarioAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  await eliminarUsuarioAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    {
      organizacionId: usuario.organizacionId,
      rolSolicitante: usuario.rol,
      usuarioIdSolicitante: usuario.id,
      id,
    }
  );

  revalidatePath("/usuarios");
}
