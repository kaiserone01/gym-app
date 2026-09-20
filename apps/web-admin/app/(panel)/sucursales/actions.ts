"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearSucursal, RolNoAutorizadoError as RolNoAutorizadoCrear } from "@gym-app/domain/use-cases/CrearSucursal";
import {
  actualizarSucursal,
  RolNoAutorizadoError as RolNoAutorizadoActualizar,
  SucursalNoEncontradaError,
} from "@gym-app/domain/use-cases/ActualizarSucursal";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioSucursal {
  error?: string;
}

function deps() {
  return {
    sucursales: new PrismaSucursalRepository(prisma),
    autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
  };
}

export async function crearSucursalAction(
  _estadoPrevio: EstadoFormularioSucursal,
  formData: FormData
): Promise<EstadoFormularioSucursal> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const direccion = formData.get("direccion")?.toString().trim() || null;
  const diasGracia = Number(formData.get("diasGracia"));

  if (!nombre || Number.isNaN(diasGracia)) {
    return { error: "Nombre y días de gracia son requeridos." };
  }

  try {
    await crearSucursal(deps(), {
      organizacionId: usuario.organizacionId,
      usuarioIdSolicitante: usuario.id,
      nombre,
      direccion,
      diasGracia,
    });
  } catch (error) {
    if (error instanceof RolNoAutorizadoCrear) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/sucursales");
  redirect(conMensajeOk("/sucursales", "Sucursal creada."));
}

export async function actualizarSucursalAction(
  id: string,
  _estadoPrevio: EstadoFormularioSucursal,
  formData: FormData
): Promise<EstadoFormularioSucursal> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const direccion = formData.get("direccion")?.toString().trim() || null;
  const diasGracia = Number(formData.get("diasGracia"));

  if (!nombre || Number.isNaN(diasGracia)) {
    return { error: "Nombre y días de gracia son requeridos." };
  }

  try {
    await actualizarSucursal(deps(), {
      organizacionId: usuario.organizacionId,
      usuarioIdSolicitante: usuario.id,
      id,
      cambios: { nombre, direccion, diasGracia },
    });
  } catch (error) {
    if (error instanceof RolNoAutorizadoActualizar || error instanceof SucursalNoEncontradaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/sucursales");
  redirect(conMensajeOk("/sucursales", "Cambios guardados."));
}

export async function darDeBajaSucursalAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarSucursal(deps(), {
    organizacionId: usuario.organizacionId,
    usuarioIdSolicitante: usuario.id,
    id,
    cambios: { activo: false },
  });

  revalidatePath("/sucursales");
  redirect(conMensajeOk(`/sucursales/${id}`, "Sucursal dada de baja."));
}

export async function reactivarSucursalAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarSucursal(deps(), {
    organizacionId: usuario.organizacionId,
    usuarioIdSolicitante: usuario.id,
    id,
    cambios: { activo: true },
  });

  revalidatePath("/sucursales");
  redirect(conMensajeOk(`/sucursales/${id}`, "Sucursal reactivada."));
}
