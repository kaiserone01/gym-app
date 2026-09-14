"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import {
  registrarPago,
  MiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
} from "@gym-app/domain/use-cases/RegistrarPago";

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

  if (!miembroId || !planId || !metodo || Number.isNaN(monto)) {
    return { error: "Miembro, plan, método y monto son requeridos." };
  }

  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planId,
        monto,
        metodo,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/pagos");
  revalidatePath(`/miembros/${miembroId}`);
  redirect(`/miembros/${miembroId}`);
}
