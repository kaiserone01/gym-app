"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { crearPlan, SucursalesRequeridasError, SucursalInvalidaError } from "@gym-app/domain/use-cases/CrearPlan";
import { actualizarPlan, PlanNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarPlan";
import type { TipoAccesoPlan } from "@gym-app/domain/entities/Plan";

export interface EstadoFormularioPlan {
  error?: string;
}

export async function crearPlanAction(
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const tipoAcceso = formData.get("tipoAcceso")?.toString() as TipoAccesoPlan | undefined;
  const precioUSD = Number(formData.get("precioUSD"));
  const sucursalIds = formData.getAll("sucursalIds").map((valor) => valor.toString());

  if (!nombre || !tipoAcceso || Number.isNaN(precioUSD)) {
    return { error: "Nombre, tipo de acceso y precio son requeridos." };
  }

  try {
    await crearPlan(
      { planes: new PrismaPlanRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre,
        tipoAcceso,
        precioUSD,
        sucursalIds,
      }
    );
  } catch (error) {
    if (error instanceof SucursalesRequeridasError || error instanceof SucursalInvalidaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/planes");
  redirect("/planes");
}

export async function actualizarPlanAction(
  id: string,
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const precioUSD = Number(formData.get("precioUSD"));

  if (!nombre || Number.isNaN(precioUSD)) {
    return { error: "Nombre y precio son requeridos." };
  }

  try {
    await actualizarPlan(
      { planes: new PrismaPlanRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, cambios: { nombre, precioUSD } }
    );
  } catch (error) {
    if (error instanceof PlanNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/planes");
  redirect("/planes");
}

export async function darDeBajaPlanAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: false } }
  );

  revalidatePath("/planes");
}

export async function reactivarPlanAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: true } }
  );

  revalidatePath("/planes");
}
