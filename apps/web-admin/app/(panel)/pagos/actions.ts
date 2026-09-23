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
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { conMensajeOk } from "../redirectConMensaje";
import {
  registrarPago,
  MiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import {
  cambiarPlanConPago,
  MiembroNoEncontradoError as MiembroNoEncontradoErrorCambio,
  PlanNoEncontradoError as PlanNoEncontradoErrorCambio,
  PlanInactivoError as PlanInactivoErrorCambio,
  RolNoAutorizadoError as RolNoAutorizadoErrorCambio,
  SinCicloVigenteError,
  MetodoPagoRequeridoError,
  FrecuenciaDistintaError,
} from "@gym-app/domain/use-cases/CambiarPlanConPago";

export interface EstadoFormularioPago {
  error?: string;
  // Solo se completa cuando la acción NO redirige (origen "miembro" o
  // "caja", ver más abajo) — el formulario sigue montado en la misma
  // página, así que el éxito viaja por acá en vez de por ?ok= en la URL.
  ok?: string;
  // Fecha real de fin de ciclo tras el pago (ISO) — solo presente junto
  // con `ok`. La usa el Paso 4 del modal de Caja para mostrar la fecha de
  // vencimiento resultante sin recalcularla en el cliente.
  fechaFinCiclo?: string;
}

export async function registrarPagoAction(
  _estadoPrevio: EstadoFormularioPago,
  formData: FormData
): Promise<EstadoFormularioPago> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const planId = formData.get("planId")?.toString();
  const monto = Number(formData.get("monto"));
  const metodo = formData.get("metodo")?.toString();
  const metodoPagoId = formData.get("metodoPagoId")?.toString() || null;
  const tasaCambioRaw = formData.get("tasaCambio")?.toString();
  const origen = formData.get("origen")?.toString();
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;
  // Sede elegida en el selector "Sede del pago" (ver SelectorMetodoPago);
  // si no vino (formularios viejos o sin selector visible), se cae a la
  // sede activa de la sesión.
  const sucursalIdPago = formData.get("sucursalIdPago")?.toString() || sucursalActivaId;

  if (!miembroId || !planId || !metodo || !metodoPagoId || Number.isNaN(monto)) {
    return { error: "Miembro, plan, método y monto son requeridos." };
  }
  if (!sucursalIdPago) {
    return { error: "No se pudo determinar en qué sucursal se registra el pago." };
  }

  let pago;
  try {
    pago = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planId,
        monto,
        metodo,
        metodoPagoId,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
        sucursalId: sucursalIdPago,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
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
  revalidatePath("/caja");

  if (origen !== "miembro" && origen !== "caja") {
    redirect(conMensajeOk(`/miembros/${miembroId}`, "Pago registrado."));
  }

  return { ok: "Pago registrado.", fechaFinCiclo: pago.fechaFinCiclo?.toISOString() };
}

export interface EstadoCambioPlan {
  error?: string;
  ok?: string;
}

export async function cambiarPlanAction(
  _estadoPrevio: EstadoCambioPlan,
  formData: FormData
): Promise<EstadoCambioPlan> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const planNuevoId = formData.get("planNuevoId")?.toString();
  const metodo = formData.get("metodo")?.toString() || null;
  const metodoPagoId = formData.get("metodoPagoId")?.toString() || null;
  const tasaCambioRaw = formData.get("tasaCambio")?.toString();
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;
  const sucursalIdPago = formData.get("sucursalIdPago")?.toString() || sucursalActivaId;

  if (!miembroId || !planNuevoId) {
    return { error: "Miembro y plan nuevo son requeridos." };
  }
  if (!sucursalIdPago) {
    return { error: "No se pudo determinar en qué sucursal se registra el cambio." };
  }

  let resultado;
  try {
    resultado = await cambiarPlanConPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        planNuevoId,
        metodo,
        metodoPagoId,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
        sucursalId: sucursalIdPago,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof MiembroNoEncontradoErrorCambio ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof PlanNoEncontradoErrorCambio ||
      error instanceof PlanInactivoErrorCambio ||
      error instanceof RolNoAutorizadoErrorCambio ||
      error instanceof SinCicloVigenteError ||
      error instanceof MetodoPagoRequeridoError ||
      error instanceof FrecuenciaDistintaError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/pagos");
  revalidatePath("/miembros");
  revalidatePath(`/miembros/${miembroId}`);
  revalidatePath(`/miembros/${miembroId}/pagos`);
  revalidatePath("/caja");

  return {
    ok:
      resultado.diferencia > 0
        ? `Plan cambiado — se cobró la diferencia de $${resultado.diferencia.toFixed(2)}.`
        : "Plan cambiado, sin costo adicional.",
  };
}
