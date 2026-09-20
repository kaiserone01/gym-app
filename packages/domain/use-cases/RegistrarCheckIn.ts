import { IMemberRepository } from "../ports/IMemberRepository";
import { ICheckInRepository } from "../ports/ICheckInRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { EstadoCheckIn } from "../entities/CheckIn";
import { validarAccesoSucursal } from "./ValidarAccesoSucursalPorPlan";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface RegistrarCheckInDeps {
  miembros: IMemberRepository;
  checkIns: ICheckInRepository;
  suscripciones: ISuscripcionRepository;
  sucursales: ISucursalRepository;
}

export interface RegistrarCheckInInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
}

export interface RegistrarCheckInResultado {
  nombre: string;
  fotoUrl: string | null;
  entrenadorNombre: string | null;
  estado: EstadoCheckIn;
  // Sede asignada al miembro — se informa siempre, pero cobra sentido en
  // el kiosco cuando estado === "sucursal_incorrecta" ("Acceso denegado,
  // tu sede es X en Y").
  sucursalAsignadaNombre: string;
  sucursalAsignadaDireccion: string | null;
  // Días de gracia que le quedan al miembro en la sucursal física donde
  // hizo el check-in — solo tiene sentido cuando estado es "en_gracia"
  // (null en cualquier otro estado).
  diasGraciaRestantes: number | null;
}

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró ningún miembro con esa cédula.");
  }
}

export async function registrarCheckIn(
  deps: RegistrarCheckInDeps,
  input: RegistrarCheckInInput
): Promise<RegistrarCheckInResultado> {
  const miembro = await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula);

  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }

  const sucursalAsignada = miembro.sucursalId
    ? await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId)
    : null;

  const sucursalDelCheckIn = await deps.sucursales.buscarPorId(input.organizacionId, input.sucursalId);
  const diasGracia = sucursalDelCheckIn?.diasGracia ?? 0;

  const base = {
    nombre: miembro.nombre,
    fotoUrl: miembro.fotoUrl,
    entrenadorNombre: miembro.entrenadorNombre,
    // Sin sucursalId (miembro "Ambas") no hay una sede única que informar
    // en un eventual mensaje de acceso denegado — de hecho nunca se
    // deniega por sede a este miembro, ver validarAccesoSucursal.
    sucursalAsignadaNombre: miembro.sucursalId ? sucursalAsignada?.nombre ?? "" : "Ambas",
    sucursalAsignadaDireccion: sucursalAsignada?.direccion ?? null,
  };

  const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const existente = await deps.checkIns.buscarRecientePorMiembroYSucursal(
    miembro.id,
    input.sucursalId,
    desde
  );

  function calcularDiasGraciaRestantes(ahora: Date): number | null {
    if (!miembro!.fechaVencimiento || diasGracia <= 0) return null;
    const limiteGracia = miembro!.fechaVencimiento.getTime() + diasGracia * MS_POR_DIA;
    const restantesMs = limiteGracia - ahora.getTime();
    if (restantesMs <= 0) return null;
    return Math.ceil(restantesMs / MS_POR_DIA);
  }

  if (existente) {
    return {
      ...base,
      estado: existente.estadoAlMomento,
      diasGraciaRestantes: existente.estadoAlMomento === "en_gracia" ? calcularDiasGraciaRestantes(new Date()) : null,
    };
  }

  const ahora = new Date();
  const estado = await validarAccesoSucursal(
    { suscripciones: deps.suscripciones },
    miembro.id,
    miembro.sucursalId,
    input.sucursalId,
    miembro.fechaVencimiento,
    diasGracia,
    ahora
  );

  await deps.checkIns.crear({
    sucursalId: input.sucursalId,
    miembroId: miembro.id,
    estadoAlMomento: estado,
  });

  return {
    ...base,
    estado,
    diasGraciaRestantes: estado === "en_gracia" ? calcularDiasGraciaRestantes(ahora) : null,
  };
}
