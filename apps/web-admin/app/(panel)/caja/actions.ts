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
import { orquestadorTasa, validarTasaCobro, validarTasaSiEsEnBs } from "@/lib/tasaBcv";
import { PrismaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaProductoRepository";
import {
  venderProducto,
  RolNoAutorizadoError as RolNoAutorizadoVender,
  ProductoNoEncontradoError,
  ProductoInactivoError,
  CantidadInvalidaError,
  SinTurnoAbiertoError,
} from "@gym-app/domain/use-cases/VenderProducto";
import { LineasDePagoInvalidasError, MontoLineasNoCubreObjetivoError } from "@gym-app/domain/entities/Pago";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaDeudaProductoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaDeudaProductoRepository";
import {
  fiarProducto,
  RolNoAutorizadoError as RolNoAutorizadoFiar,
  MiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  ProductoNoEncontradoError as ProductoNoEncontradoFiar,
  ProductoInactivoError as ProductoInactivoFiar,
  CantidadInvalidaError as CantidadInvalidaFiar,
} from "@gym-app/domain/use-cases/FiarProducto";
import {
  cobrarDeudasMiembro,
  RolNoAutorizadoError as RolNoAutorizadoCobrar,
  SinDeudasPendientesError,
  DeudasYaCobradasError,
  SinTurnoAbiertoError as SinTurnoAbiertoCobrar,
} from "@gym-app/domain/use-cases/CobrarDeudasMiembro";
import {
  anularDeuda,
  RolNoAutorizadoError as RolNoAutorizadoAnularDeuda,
  DeudaNoPendienteError,
} from "@gym-app/domain/use-cases/AnularDeuda";
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

export interface EstadoVenderProducto {
  error?: string;
  ok?: string;
  // Mismo aviso de tasa que EstadoFormularioPago (pagos/actions.ts).
  tasaNueva?: number;
  fallaTemporal?: boolean;
  tasaGuardada?: number;
}

export async function venderProductoAction(
  _estadoPrevio: EstadoVenderProducto,
  formData: FormData
): Promise<EstadoVenderProducto> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const productoId = formData.get("productoId")?.toString();
  const cantidad = Number(formData.get("cantidad"));
  const lineasRaw = formData.get("lineas")?.toString();
  if (!productoId || !lineasRaw) {
    return { error: "Producto y al menos un método de pago son requeridos." };
  }

  let lineas: Array<{
    monto: number;
    metodo: string;
    metodoPagoId: string | null;
    numeroOperacion: string | null;
    tasaCambio: number | null;
  }>;
  try {
    lineas = JSON.parse(lineasRaw);
  } catch {
    return { error: "No se pudo interpretar la información del pago." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0 || lineas.some((linea) => !linea.metodoPagoId)) {
    return { error: "Cada línea del pago necesita un monto y un método." };
  }

  // Cada línea en Bs se revalida contra la tasa vigente del servidor (igual
  // que registrarPagoAction) — nunca se confía en la tasa del formulario.
  const lineasValidadas: typeof lineas = [];
  for (const linea of lineas) {
    const validacionTasa = await validarTasaSiEsEnBs(linea.tasaCambio !== null ? String(linea.tasaCambio) : undefined);
    if (!validacionTasa.ok) return validacionTasa.estado;
    lineasValidadas.push({ ...linea, tasaCambio: validacionTasa.tasaCambio });
  }

  try {
    await venderProducto(
      {
        pagos: new PrismaPagoRepository(prisma),
        productos: new PrismaProductoRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        productoId,
        cantidad,
        lineas: lineasValidadas,
        sucursalId: sucursalActivaId,
        registradoPorId: usuario.id,
      }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoVender ||
      error instanceof ProductoNoEncontradoError ||
      error instanceof ProductoInactivoError ||
      error instanceof CantidadInvalidaError ||
      error instanceof SinTurnoAbiertoError ||
      error instanceof LineasDePagoInvalidasError ||
      error instanceof MontoLineasNoCubreObjetivoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  revalidatePath("/pagos");
  return { ok: "Venta registrada." };
}

export interface EstadoFiarProducto {
  error?: string;
  ok?: string;
}

export async function fiarProductoAction(
  _estadoPrevio: EstadoFiarProducto,
  formData: FormData
): Promise<EstadoFiarProducto> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const productoId = formData.get("productoId")?.toString();
  if (!miembroId || !productoId) {
    return { error: "Elige el miembro y el producto." };
  }

  try {
    await fiarProducto(
      {
        deudas: new PrismaDeudaProductoRepository(prisma),
        productos: new PrismaProductoRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId,
        productoId,
        cantidad: Number(formData.get("cantidad")),
        sucursalId: sucursalActivaId,
        registradaPorId: usuario.id,
      }
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoFiar ||
      error instanceof MiembroNoEncontradoError ||
      error instanceof MiembroFueraDeSucursalError ||
      error instanceof ProductoNoEncontradoFiar ||
      error instanceof ProductoInactivoFiar ||
      error instanceof CantidadInvalidaFiar
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return { ok: "Producto fiado." };
}

export interface EstadoCobrarDeudas {
  error?: string;
  ok?: string;
  // Mismo aviso de tasa que EstadoVenderProducto.
  tasaNueva?: number;
  fallaTemporal?: boolean;
  tasaGuardada?: number;
}

export async function cobrarDeudasAction(
  _estadoPrevio: EstadoCobrarDeudas,
  formData: FormData
): Promise<EstadoCobrarDeudas> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const miembroId = formData.get("miembroId")?.toString();
  const lineasRaw = formData.get("lineas")?.toString();
  if (!miembroId || !lineasRaw) {
    return { error: "Elige un miembro y un método de pago." };
  }

  let lineas: Array<{
    monto: number;
    metodo: string;
    metodoPagoId: string | null;
    numeroOperacion: string | null;
    tasaCambio: number | null;
  }>;
  try {
    lineas = JSON.parse(lineasRaw);
  } catch {
    return { error: "No se pudo interpretar la información del pago." };
  }
  if (!Array.isArray(lineas) || lineas.length === 0 || lineas.some((linea) => !linea.metodoPagoId)) {
    return { error: "Cada línea del pago necesita un monto y un método." };
  }

  const lineasValidadas: typeof lineas = [];
  for (const linea of lineas) {
    const validacionTasa = await validarTasaSiEsEnBs(linea.tasaCambio !== null ? String(linea.tasaCambio) : undefined);
    if (!validacionTasa.ok) return validacionTasa.estado;
    lineasValidadas.push({ ...linea, tasaCambio: validacionTasa.tasaCambio });
  }

  try {
    // Transacción: si algo falla después de marcar las deudas como
    // cobradas, no queda ninguna a medio escribir (mismo patrón que
    // cambiarPlanAction en pagos/actions.ts).
    await prisma.$transaction((tx) =>
      cobrarDeudasMiembro(
        {
          deudas: new PrismaDeudaProductoRepository(tx),
          pagos: new PrismaPagoRepository(tx),
          turnos: new PrismaTurnoRepository(tx),
          autorizacion: new AuthorizationService(new PrismaPermisoRepository(tx)),
        },
        {
          organizacionId: usuario.organizacionId,
          miembroId,
          lineas: lineasValidadas,
          sucursalId: sucursalActivaId,
          registradoPorId: usuario.id,
        }
      )
    );
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoCobrar ||
      error instanceof SinDeudasPendientesError ||
      error instanceof DeudasYaCobradasError ||
      error instanceof SinTurnoAbiertoCobrar ||
      error instanceof LineasDePagoInvalidasError ||
      error instanceof MontoLineasNoCubreObjetivoError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  revalidatePath("/pagos");
  return { ok: "Deuda cobrada." };
}

// Devuelve el error en vez de lanzarlo: en producción Next oculta el
// mensaje de una excepción de Server Action, y acá el cajero necesita leerlo.
export async function anularDeudaAction(id: string): Promise<{ error?: string; ok?: string }> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  try {
    await anularDeuda(
      {
        deudas: new PrismaDeudaProductoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      { organizacionId: usuario.organizacionId, id, anuladaPorId: usuario.id }
    );
  } catch (error) {
    if (error instanceof RolNoAutorizadoAnularDeuda || error instanceof DeudaNoPendienteError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/caja");
  return { ok: "Deuda anulada." };
}
