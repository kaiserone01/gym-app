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
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { orquestadorTasa, validarTasaCobro } from "@/lib/tasaBcv";
import { abrirTurno, RolNoAutorizadoError as RolNoAutorizadoAbrir, TurnoYaAbiertoError, SucursalNoEncontradaError } from "@gym-app/domain/use-cases/AbrirTurno";
import { registrarEgreso, RolNoAutorizadoError as RolNoAutorizadoEgreso, TurnoCerradoError, TurnoNoEncontradoError as TurnoNoEncontradoEgreso, MotivoRequeridoError, TasaRequeridaError as TasaRequeridaEgreso } from "@gym-app/domain/use-cases/RegistrarEgreso";
import { cerrarTurno, RolNoAutorizadoError as RolNoAutorizadoCerrar, TurnoYaCerradoError, TurnoNoEncontradoError as TurnoNoEncontradoCerrar, NotaRequeridaError } from "@gym-app/domain/use-cases/CerrarTurno";
import { anularPago, RolNoAutorizadoError as RolNoAutorizadoAnular, PagoNoEncontradoError, PagoYaAnuladoError, MotivoRequeridoError as MotivoRequeridoAnular } from "@gym-app/domain/use-cases/AnularPago";

export interface EstadoAbrirTurno {
  error?: string;
  ok?: string;
}

export async function abrirTurnoAction(
  _estadoPrevio: EstadoAbrirTurno,
  formData: FormData
): Promise<EstadoAbrirTurno> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  // sucursalActivaId siempre existe (garantizado por Sesion, ver Task 1
  // del plan de selección de sucursal) — ya no hace falta el fallback al
  // <select> del formulario, ni el error de "sucursal requerida": la
  // sucursal ya está decidida por la sesión, no por lo que el operador
  // haya elegido en un campo del formulario de abrir turno.
  const sucursalId = sucursalActivaId;

  const fondoInicialEfectivoUSD = Number(formData.get("fondoInicialEfectivoUSD"));
  const fondoInicialEfectivoBs = Number(formData.get("fondoInicialEfectivoBs"));
  if (Number.isNaN(fondoInicialEfectivoUSD) || Number.isNaN(fondoInicialEfectivoBs)) {
    return { error: "El fondo inicial en efectivo (USD y Bs) es requerido." };
  }

  try {
    await abrirTurno(
      {
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        sucursalId,
        usuarioId: usuario.id,
        rolUsuario: usuario.rol,
        fondoInicialEfectivoUSD,
        fondoInicialEfectivoBs,
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
  return { ok: "Turno abierto." };
}

export interface EstadoRegistrarEgreso {
  error?: string;
  ok?: string;
  // Ver EstadoFormularioPago en pagos/actions.ts — mismo criterio de
  // reconfirmación/aviso de fallo temporal (Etapa 3 del plan de tasa BCV).
  tasaNueva?: number;
  fallaTemporal?: boolean;
  tasaGuardada?: number;
}

export async function registrarEgresoAction(
  _estadoPrevio: EstadoRegistrarEgreso,
  formData: FormData
): Promise<EstadoRegistrarEgreso> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const turnoId = formData.get("turnoId")?.toString();
  const monto = Number(formData.get("monto"));
  const moneda = formData.get("moneda")?.toString();
  const metodo = formData.get("metodo")?.toString();
  const motivo = formData.get("motivo")?.toString() ?? "";
  // Solo relevante para moneda BS — capturada en el cliente desde
  // /api/tasa-cambio al momento de registrar (ver ModalRegistrarEgreso).
  const tasaCambioTexto = formData.get("tasaCambio")?.toString();

  if (!turnoId || Number.isNaN(monto) || (moneda !== "USD" && moneda !== "BS") || !metodo) {
    return { error: "Monto, moneda y método son requeridos." };
  }

  let tasaCambio: number | null = null;
  if (moneda === "BS" && tasaCambioTexto) {
    const fresca = await orquestadorTasa.obtenerTasaVigenteFresca({ forzar: true });
    const resultado = validarTasaCobro(Number(tasaCambioTexto), fresca);
    if (!resultado.ok) {
      if ("fallaTemporal" in resultado) {
        return { error: resultado.error, fallaTemporal: true, tasaGuardada: resultado.tasaGuardada };
      }
      return { error: resultado.error, tasaNueva: resultado.tasaNueva };
    }
    tasaCambio = resultado.tasa;
  }

  try {
    await registrarEgreso(
      {
        turnos: new PrismaTurnoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        sucursalIdUsuario: sucursalActivaId,
        turnoId,
        rolUsuario: usuario.rol,
        usuarioIdSolicitante: usuario.id,
        monto,
        moneda,
        tasaCambio,
        metodo,
        motivo,
      }
    );
  } catch (error) {
    if (
      error instanceof TurnoCerradoError ||
      error instanceof TurnoNoEncontradoEgreso ||
      error instanceof MotivoRequeridoError ||
      error instanceof TasaRequeridaEgreso ||
      error instanceof RolNoAutorizadoEgreso
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return { ok: "Egreso registrado." };
}

export interface EstadoCerrarTurno {
  error?: string;
  ok?: string;
}

export async function cerrarTurnoAction(
  _estadoPrevio: EstadoCerrarTurno,
  formData: FormData
): Promise<EstadoCerrarTurno> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const turnoId = formData.get("turnoId")?.toString();
  if (!turnoId) redirect("/caja");

  // Los métodos reales del turno vienen del propio formulario (ver
  // FormularioArqueo) — antes se iteraba el catálogo estático
  // METODOS_PAGO, que quedó con códigos viejos (efectivo_usd, etc.) que
  // ya no coinciden con los métodos reales (ej. "Efectivo (USD)"), así
  // que ningún campo montoContado_* se encontraba y el arqueo se
  // guardaba vacío aunque el operador sí hubiera escrito los montos.
  const metodos = formData.getAll("metodos").map((m) => m.toString());
  const lineas = metodos.map((metodo) => {
    const montoContadoTexto = formData.get(`montoContado_${metodo}`)?.toString();
    if (montoContadoTexto === undefined || montoContadoTexto === "") return null;
    return {
      metodo,
      montoContado: Number(montoContadoTexto),
      nota: formData.get(`nota_${metodo}`)?.toString() || undefined,
    };
  }).filter((l): l is NonNullable<typeof l> => l !== null);

  try {
    await cerrarTurno(
      {
        turnos: new PrismaTurnoRepository(prisma),
        arqueo: new PrismaArqueoRepository(prisma),
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        sucursalIdUsuario: sucursalActivaId,
        turnoId,
        rolUsuario: usuario.rol,
        usuarioIdSolicitante: usuario.id,
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
  return { ok: "Turno cerrado." };
}

export interface EstadoAnularPago {
  error?: string;
  ok?: string;
}

export async function anularPagoAction(
  _estadoPrevio: EstadoAnularPago,
  formData: FormData
): Promise<EstadoAnularPago> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const pagoId = formData.get("pagoId")?.toString();
  const motivo = formData.get("motivo")?.toString() ?? "";
  if (!pagoId) {
    return { error: "Pago inválido." };
  }

  try {
    await anularPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
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
  return { ok: "Pago anulado." };
}
