"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { abrirTurno, RolNoAutorizadoError as RolNoAutorizadoAbrir, TurnoYaAbiertoError, SucursalNoEncontradaError } from "@gym-app/domain/use-cases/AbrirTurno";
import { registrarEgreso, RolNoAutorizadoError as RolNoAutorizadoEgreso, TurnoCerradoError, TurnoNoEncontradoError as TurnoNoEncontradoEgreso, MotivoRequeridoError } from "@gym-app/domain/use-cases/RegistrarEgreso";
import { cerrarTurno, RolNoAutorizadoError as RolNoAutorizadoCerrar, TurnoYaCerradoError, TurnoNoEncontradoError as TurnoNoEncontradoCerrar, NotaRequeridaError } from "@gym-app/domain/use-cases/CerrarTurno";
import { anularPago, RolNoAutorizadoError as RolNoAutorizadoAnular, PagoNoEncontradoError, PagoYaAnuladoError, MotivoRequeridoError as MotivoRequeridoAnular } from "@gym-app/domain/use-cases/AnularPago";
import { METODOS_PAGO } from "../metodosPago";

export interface EstadoAbrirTurno {
  error?: string;
}

export async function abrirTurnoAction(
  _estadoPrevio: EstadoAbrirTurno,
  formData: FormData
): Promise<EstadoAbrirTurno> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursalId = usuario.sucursalId ?? formData.get("sucursalId")?.toString();
  if (!sucursalId) {
    return { error: "Debés seleccionar una sucursal para abrir el turno." };
  }

  const fondoInicialUSD = Number(formData.get("fondoInicialUSD"));
  const fondoInicialBs = Number(formData.get("fondoInicialBs"));
  if (Number.isNaN(fondoInicialUSD) || Number.isNaN(fondoInicialBs)) {
    return { error: "El fondo inicial en USD y en Bs son requeridos." };
  }

  try {
    await abrirTurno(
      { turnos: new PrismaTurnoRepository(prisma), sucursales: new PrismaSucursalRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        sucursalId,
        usuarioId: usuario.id,
        rolUsuario: usuario.rol,
        fondoInicialUSD,
        fondoInicialBs,
      }
    );
  } catch (error) {
    if (
      error instanceof TurnoYaAbiertoError ||
      error instanceof RolNoAutorizadoAbrir ||
      error instanceof SucursalNoEncontradaError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}

export interface EstadoRegistrarEgreso {
  error?: string;
}

export async function registrarEgresoAction(
  _estadoPrevio: EstadoRegistrarEgreso,
  formData: FormData
): Promise<EstadoRegistrarEgreso> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoId = formData.get("turnoId")?.toString();
  const monto = Number(formData.get("monto"));
  const moneda = formData.get("moneda")?.toString();
  const metodo = formData.get("metodo")?.toString();
  const motivo = formData.get("motivo")?.toString() ?? "";

  if (!turnoId || Number.isNaN(monto) || (moneda !== "USD" && moneda !== "BS") || !metodo) {
    return { error: "Monto, moneda y método son requeridos." };
  }

  try {
    await registrarEgreso(
      { turnos: new PrismaTurnoRepository(prisma), egresos: new PrismaEgresoRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        sucursalIdUsuario: usuario.sucursalId,
        turnoId,
        rolUsuario: usuario.rol,
        monto,
        moneda,
        metodo,
        motivo,
      }
    );
  } catch (error) {
    if (
      error instanceof TurnoCerradoError ||
      error instanceof TurnoNoEncontradoEgreso ||
      error instanceof MotivoRequeridoError ||
      error instanceof RolNoAutorizadoEgreso
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}

export interface EstadoCerrarTurno {
  error?: string;
}

export async function cerrarTurnoAction(
  _estadoPrevio: EstadoCerrarTurno,
  formData: FormData
): Promise<EstadoCerrarTurno> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoId = formData.get("turnoId")?.toString();
  if (!turnoId) redirect("/caja");

  const lineas = METODOS_PAGO.map((m) => {
    const montoContadoTexto = formData.get(`montoContado_${m.value}`)?.toString();
    if (montoContadoTexto === undefined || montoContadoTexto === "") return null;
    return {
      metodo: m.value,
      montoContado: Number(montoContadoTexto),
      nota: formData.get(`nota_${m.value}`)?.toString() || undefined,
    };
  }).filter((l): l is NonNullable<typeof l> => l !== null);

  try {
    await cerrarTurno(
      {
        turnos: new PrismaTurnoRepository(prisma),
        arqueo: new PrismaArqueoRepository(prisma),
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        sucursalIdUsuario: usuario.sucursalId,
        turnoId,
        rolUsuario: usuario.rol,
        lineas,
      }
    );
  } catch (error) {
    if (
      error instanceof TurnoYaCerradoError ||
      error instanceof TurnoNoEncontradoCerrar ||
      error instanceof NotaRequeridaError ||
      error instanceof RolNoAutorizadoCerrar
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}

export interface EstadoAnularPago {
  error?: string;
}

export async function anularPagoAction(
  _estadoPrevio: EstadoAnularPago,
  formData: FormData
): Promise<EstadoAnularPago> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const pagoId = formData.get("pagoId")?.toString();
  const motivo = formData.get("motivo")?.toString() ?? "";
  if (!pagoId) {
    return { error: "Pago inválido." };
  }

  try {
    await anularPago(
      { pagos: new PrismaPagoRepository(prisma) },
      { organizacionId: usuario.organizacionId, pagoId, anuladoPorId: usuario.id, rolAnulador: usuario.rol, motivo }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoAnular ||
      error instanceof PagoNoEncontradoError ||
      error instanceof PagoYaAnuladoError ||
      error instanceof MotivoRequeridoAnular
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return {};
}
