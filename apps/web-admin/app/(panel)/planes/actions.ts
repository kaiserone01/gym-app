"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { crearPlan } from "@gym-app/domain/use-cases/CrearPlan";
import { actualizarPlan, PlanNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarPlan";
import {
  actualizarFrecuenciaPlan,
  RolNoAutorizadoError,
  PlanNoEncontradoError as ActualizarFrecuenciaPlanNoEncontradoError,
  ConfirmacionInvalidaError,
} from "@gym-app/domain/use-cases/ActualizarFrecuenciaPlan";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioPlan {
  error?: string;
}

export async function crearPlanAction(
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const nombre = formData.get("nombre")?.toString().trim();
  const frecuencia = formData.get("frecuencia")?.toString() as FrecuenciaPago | undefined;
  const incluyeEntrenador = formData.get("incluyeEntrenador")?.toString() === "on";
  const multisede = formData.get("multisede")?.toString() === "on";
  const precioUSD = Number(formData.get("precioUSD"));

  if (!nombre || !frecuencia || Number.isNaN(precioUSD)) {
    return { error: "Nombre, frecuencia y precio son requeridos." };
  }

  await crearPlan(
    { planes: new PrismaPlanRepository(prisma) },
    {
      organizacionId: usuario.organizacionId,
      nombre,
      frecuencia,
      incluyeEntrenador,
      precioUSD,
      multisede,
    }
  );

  revalidatePath("/planes");
  redirect(conMensajeOk("/planes", "Plan creado."));
}

export async function actualizarPlanAction(
  id: string,
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const nombre = formData.get("nombre")?.toString().trim();
  const precioUSD = Number(formData.get("precioUSD"));
  const multisede = formData.get("multisede")?.toString() === "on";

  if (!nombre || Number.isNaN(precioUSD)) {
    return { error: "Nombre y precio son requeridos." };
  }

  try {
    await actualizarPlan(
      { planes: new PrismaPlanRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, cambios: { nombre, precioUSD, multisede } }
    );
  } catch (error) {
    if (error instanceof PlanNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/planes");
  redirect(conMensajeOk("/planes", "Cambios guardados."));
}

export async function actualizarFrecuenciaPlanAction(
  id: string,
  _estadoPrevio: EstadoFormularioPlan,
  formData: FormData
): Promise<EstadoFormularioPlan> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const frecuencia = formData.get("frecuencia")?.toString() as FrecuenciaPago | undefined;
  const incluyeEntrenador = formData.get("incluyeEntrenador")?.toString() === "1";
  const exonerar = formData.get("exonerar")?.toString() === "1";
  const confirmacion = formData.get("confirmacion")?.toString() ?? "";

  if (!frecuencia) {
    return { error: "Frecuencia es requerida." };
  }

  try {
    await actualizarFrecuenciaPlan(
      { planes: new PrismaPlanRepository(prisma), suscripciones: new PrismaSuscripcionRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        rolSolicitante: usuario.rol,
        planId: id,
        frecuencia,
        incluyeEntrenador,
        confirmacion,
        exonerar,
      }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoError ||
      error instanceof ActualizarFrecuenciaPlanNoEncontradoError ||
      error instanceof ConfirmacionInvalidaError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/planes");
  redirect(conMensajeOk(`/planes/${id}`, "Frecuencia del plan actualizada."));
}

export async function darDeBajaPlanAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  await actualizarPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: false } }
  );

  revalidatePath("/planes");
  redirect(conMensajeOk(`/planes/${id}`, "Plan dado de baja."));
}

export async function reactivarPlanAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  await actualizarPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: true } }
  );

  revalidatePath("/planes");
  redirect(conMensajeOk(`/planes/${id}`, "Plan reactivado."));
}
