"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearPlan } from "@gym-app/domain/use-cases/CrearPlan";
import { actualizarPlan, PlanNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarPlan";
import {
  actualizarFrecuenciaPlan,
  RolNoAutorizadoError,
  PlanNoEncontradoError as ActualizarFrecuenciaPlanNoEncontradoError,
  ConfirmacionInvalidaError,
} from "@gym-app/domain/use-cases/ActualizarFrecuenciaPlan";
import { eliminarPlan } from "@gym-app/domain/use-cases/EliminarPlan";
import type { FrecuenciaPago, TipoMinimoAbono } from "@gym-app/domain/entities/Plan";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioPlan {
  error?: string;
}

// Compartido entre crearPlanAction y actualizarPlanAction — el checkbox
// "Permite pago parcial" siempre viaja; los campos de mínimo propio solo
// se envían cuando el formulario tiene marcado "Mínimo de abono
// personalizado" (ver FormularioPlan.tsx), así que su ausencia significa
// "sin mínimo propio, hereda el de la frecuencia".
function leerCamposDeAbono(formData: FormData): {
  permitePagoParcial: boolean;
  minimoAbonoTipo: TipoMinimoAbono | null;
  minimoAbonoValor: number | null;
} {
  const permitePagoParcial = formData.get("permitePagoParcial")?.toString() === "on";
  const minimoAbonoTipoRaw = formData.get("minimoAbonoTipo")?.toString();
  const minimoAbonoValorRaw = formData.get("minimoAbonoValor")?.toString();
  const minimoAbonoTipo =
    minimoAbonoTipoRaw === "DIAS" || minimoAbonoTipoRaw === "PORCENTAJE" ? minimoAbonoTipoRaw : null;
  const minimoAbonoValor = minimoAbonoTipo !== null && minimoAbonoValorRaw ? Number(minimoAbonoValorRaw) : null;
  return { permitePagoParcial, minimoAbonoTipo, minimoAbonoValor };
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
  const { permitePagoParcial, minimoAbonoTipo, minimoAbonoValor } = leerCamposDeAbono(formData);

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
      permitePagoParcial,
      minimoAbonoTipo,
      minimoAbonoValor,
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
  const { permitePagoParcial, minimoAbonoTipo, minimoAbonoValor } = leerCamposDeAbono(formData);

  if (!nombre || Number.isNaN(precioUSD)) {
    return { error: "Nombre y precio son requeridos." };
  }

  try {
    await actualizarPlan(
      { planes: new PrismaPlanRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        id,
        cambios: { nombre, precioUSD, multisede, permitePagoParcial, minimoAbonoTipo, minimoAbonoValor },
      }
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

// Sin redirect adentro a propósito: se llama desde la papelera en la
// lista de planes (cliente), no desde un <form action>, así que el error
// de dominio (mensaje en español, ya legible) se deja propagar para que
// el cliente lo muestre con useFeedback en vez de navegar.
export async function eliminarPlanAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  await eliminarPlan(
    { planes: new PrismaPlanRepository(prisma), autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)) },
    { organizacionId: usuario.organizacionId, id, usuarioIdSolicitante: usuario.id }
  );

  revalidatePath("/planes");
}
