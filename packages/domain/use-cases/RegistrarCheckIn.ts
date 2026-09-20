import { IMemberRepository } from "../ports/IMemberRepository";
import { ICheckInRepository } from "../ports/ICheckInRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { EstadoCheckIn } from "../entities/CheckIn";
import { validarAccesoSucursal } from "./ValidarAccesoSucursalPorPlan";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;

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

  const sucursalAsignada = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);

  const base = {
    nombre: miembro.nombre,
    fotoUrl: miembro.fotoUrl,
    entrenadorNombre: miembro.entrenadorNombre,
    sucursalAsignadaNombre: sucursalAsignada?.nombre ?? "",
    sucursalAsignadaDireccion: sucursalAsignada?.direccion ?? null,
  };

  const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const existente = await deps.checkIns.buscarRecientePorMiembroYSucursal(
    miembro.id,
    input.sucursalId,
    desde
  );

  if (existente) {
    return { ...base, estado: existente.estadoAlMomento };
  }

  const estado = await validarAccesoSucursal(
    { suscripciones: deps.suscripciones },
    miembro.id,
    miembro.sucursalId,
    input.sucursalId
  );

  await deps.checkIns.crear({
    sucursalId: input.sucursalId,
    miembroId: miembro.id,
    estadoAlMomento: estado,
  });

  return { ...base, estado };
}
