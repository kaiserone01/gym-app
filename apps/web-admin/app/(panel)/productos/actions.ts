"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { storageR2 } from "@/lib/storageR2";
import { PrismaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaProductoRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearProducto, RolNoAutorizadoError as RolNoCrear, ProductoInvalidoError } from "@gym-app/domain/use-cases/CrearProducto";
import {
  actualizarProducto,
  RolNoAutorizadoError as RolNoEditar,
  ProductoNoEncontradoError,
} from "@gym-app/domain/use-cases/ActualizarProducto";
import { eliminarProducto } from "@gym-app/domain/use-cases/EliminarProducto";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioProducto {
  error?: string;
}

const ERRORES_DE_DOMINIO = [RolNoCrear, RolNoEditar, ProductoInvalidoError, ProductoNoEncontradoError];

function esErrorDeDominio(error: unknown): error is Error {
  return ERRORES_DE_DOMINIO.some((clase) => error instanceof clase);
}

function deps() {
  return {
    productos: new PrismaProductoRepository(prisma),
    autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
  };
}

// Sube la foto al bucket de R2 (carpeta "productos") y devuelve la URL pública.
async function guardarFoto(archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const contenido = Buffer.from(await archivo.arrayBuffer());

  return storageR2().subir("productos", `${randomUUID()}.${extension}`, contenido, archivo.type || "application/octet-stream");
}

function leerCampos(formData: FormData) {
  return {
    nombre: formData.get("nombre")?.toString().trim() ?? "",
    descripcion: formData.get("descripcion")?.toString().trim() || null,
    costoUSD: Number(formData.get("costoUSD")),
  };
}

export async function crearProductoAction(
  _estadoPrevio: EstadoFormularioProducto,
  formData: FormData
): Promise<EstadoFormularioProducto> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const campos = leerCampos(formData);
  if (!campos.nombre || !(campos.costoUSD > 0)) {
    return { error: "Nombre y costo en USD (mayor a $0) son requeridos." };
  }

  try {
    await crearProducto(deps(), {
      organizacionId: usuario.organizacionId,
      usuarioIdSolicitante: usuario.id,
      ...campos,
      fotoUrl: await guardarFoto(formData.get("foto")),
    });
  } catch (error) {
    if (esErrorDeDominio(error)) return { error: error.message };
    throw error;
  }

  revalidatePath("/productos");
  redirect(conMensajeOk("/productos", "Producto creado."));
}

export async function actualizarProductoAction(
  id: string,
  _estadoPrevio: EstadoFormularioProducto,
  formData: FormData
): Promise<EstadoFormularioProducto> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const campos = leerCampos(formData);
  if (!campos.nombre || !(campos.costoUSD > 0)) {
    return { error: "Nombre y costo en USD (mayor a $0) son requeridos." };
  }

  try {
    const fotoUrl = (await guardarFoto(formData.get("foto"))) ?? (formData.get("fotoUrl")?.toString() || null);
    await actualizarProducto(deps(), {
      organizacionId: usuario.organizacionId,
      id,
      usuarioIdSolicitante: usuario.id,
      cambios: { ...campos, fotoUrl, activo: formData.get("activo")?.toString() === "on" },
    });
  } catch (error) {
    if (esErrorDeDominio(error)) return { error: error.message };
    throw error;
  }

  revalidatePath("/productos");
  redirect(conMensajeOk("/productos", "Cambios guardados."));
}

// Sin redirect adentro: se llama desde la papelera de la lista (cliente),
// igual que eliminarPlanAction. Devuelve el mensaje a mostrar.
export async function eliminarProductoAction(id: string): Promise<string> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const resultado = await eliminarProducto(deps(), {
    organizacionId: usuario.organizacionId,
    id,
    usuarioIdSolicitante: usuario.id,
  });

  revalidatePath("/productos");
  return resultado === "ELIMINADO" ? "Producto eliminado." : "El producto tiene ventas: se desactivó en vez de eliminarse.";
}
