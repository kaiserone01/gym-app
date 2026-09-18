"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import {
  registrarPago,
  MiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import { METODOS_BANCARIOS } from "../metodosPago";

export interface EstadoFormularioPago {
  error?: string;
}

export async function registrarPagoAction(
  _estadoPrevio: EstadoFormularioPago,
  formData: FormData
): Promise<EstadoFormularioPago> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const miembroId = formData.get("miembroId")?.toString();
  const planId = formData.get("planId")?.toString();
  const monto = Number(formData.get("monto"));
  const metodo = formData.get("metodo")?.toString();
  const tasaCambioRaw = formData.get("tasaCambio")?.toString();
  const origen = formData.get("origen")?.toString();
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;

  if (!miembroId || !planId || !metodo || Number.isNaN(monto)) {
    return { error: "Miembro, plan, método y monto son requeridos." };
  }
  if (!usuario.sucursalId) {
    return { error: "Debés tener una sucursal asignada para registrar pagos." };
  }

  if (METODOS_BANCARIOS.includes(metodo) && !numeroOperacion) {
    return { error: "El número de operación es requerido para pagos por banco." };
  }

  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planId,
        monto,
        metodo,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
        sucursalId: usuario.sucursalId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof RolNoAutorizadoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/pagos");
  revalidatePath(`/miembros/${miembroId}`);
  revalidatePath(`/miembros/${miembroId}/pagos`);

  if (origen !== "miembro") {
    redirect(`/miembros/${miembroId}`);
  }

  return {};
}
