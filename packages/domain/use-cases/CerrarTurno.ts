import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IArqueoRepository } from "../ports/IArqueoRepository";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IEgresoRepository } from "../ports/IEgresoRepository";
import { ArqueoLinea } from "../entities/ArqueoLinea";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { obtenerResumenTurno } from "./ObtenerResumenTurno";
import { IAuthorizationService } from "../ports/IAuthorizationService";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para realizar esta acción.");
  }
}

export class TurnoYaCerradoError extends Error {
  constructor() {
    super("Este turno ya fue cerrado.");
  }
}

export class TurnoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el turno.");
  }
}

export class NotaRequeridaError extends Error {
  constructor(public readonly metodo: string) {
    super(`Hay una diferencia en "${metodo}" — se requiere una nota explicando el motivo.`);
  }
}

export interface LineaArqueoInput {
  metodo: string;
  montoContado: number;
  nota?: string;
}

export interface DatosCerrarTurno {
  organizacionId: string;
  sucursalIdUsuario: string | null;
  usuarioIdSolicitante: string;
  turnoId: string;
  rolUsuario: RolUsuario;
  lineas: LineaArqueoInput[];
}

export async function cerrarTurno(
  deps: {
    turnos: ITurnoRepository;
    arqueo: IArqueoRepository;
    pagos: IPagoRepository;
    egresos: IEgresoRepository;
    autorizacion: IAuthorizationService;
  },
  input: DatosCerrarTurno
): Promise<ArqueoLinea[]> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "CAJA", "EDITAR"))) {
    throw new RolNoAutorizadoError();
  }

  const resumen = await obtenerResumenTurno(deps, { organizacionId: input.organizacionId, turnoId: input.turnoId });
  if (input.sucursalIdUsuario && resumen.turno.sucursalId !== input.sucursalIdUsuario) {
    throw new TurnoNoEncontradoError();
  }
  if (resumen.turno.estado === "CERRADO") {
    throw new TurnoYaCerradoError();
  }

  const esperadoPorMetodo = new Map(resumen.lineas.map((l) => [l.metodo, l.montoEsperado]));

  const datosLineas = input.lineas.map((linea) => {
    const montoEsperado = esperadoPorMetodo.get(linea.metodo) ?? 0;
    const diferencia = linea.montoContado - montoEsperado;

    if (diferencia !== 0 && !linea.nota?.trim()) {
      throw new NotaRequeridaError(linea.metodo);
    }

    return {
      turnoId: input.turnoId,
      metodo: linea.metodo,
      montoEsperado,
      montoContado: linea.montoContado,
      diferencia,
      nota: linea.nota?.trim() || null,
    };
  });

  const lineasCreadas = await deps.arqueo.crearLineas(datosLineas);
  await deps.turnos.cerrar(input.turnoId, new Date());

  return lineasCreadas;
}
