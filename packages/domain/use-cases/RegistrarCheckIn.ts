import { IMemberRepository } from "../ports/IMemberRepository";
import { ICheckInRepository } from "../ports/ICheckInRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { PlanTipo } from "../entities/Miembro";
import { EstadoCheckIn } from "../entities/CheckIn";
import { validarAccesoSucursalPorPlan } from "./ValidarAccesoSucursalPorPlan";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;

export interface RegistrarCheckInDeps {
  miembros: IMemberRepository;
  checkIns: ICheckInRepository;
  suscripciones: ISuscripcionRepository;
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
  planTipo: PlanTipo;
  estado: EstadoCheckIn;
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

  const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const existente = await deps.checkIns.buscarRecientePorMiembroYSucursal(
    miembro.id,
    input.sucursalId,
    desde
  );

  const base = {
    nombre: miembro.nombre,
    fotoUrl: miembro.fotoUrl,
    entrenadorNombre: miembro.entrenadorNombre,
    planTipo: miembro.planTipo,
  };

  if (existente) {
    return { ...base, estado: existente.estadoAlMomento };
  }

  const estado = await validarAccesoSucursalPorPlan(
    { suscripciones: deps.suscripciones },
    miembro.id,
    input.sucursalId
  );

  await deps.checkIns.crear({
    sucursalId: input.sucursalId,
    miembroId: miembro.id,
    estadoAlMomento: estado,
  });

  return { ...base, estado };
}
