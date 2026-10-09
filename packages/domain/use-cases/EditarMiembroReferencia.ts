import { IMemberRepository } from "../ports/IMemberRepository";
import { IMiembroReferenciaRepository } from "../ports/IMiembroReferenciaRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import type { MiembroReferencia } from "../entities/MiembroReferencia";
import {
  CAMPOS_EDITABLES_PADRON,
  esColorResaltadoValido,
  fechaDesdeTextoPadron,
  normalizarCamposPadron,
  type CambiosCrudosPadron,
  type CambiosEdicionPadron,
  type CampoEditablePadron,
  type CamposCrudosPadron,
} from "../utils/padronExcel";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para editar el Excel.");
  }
}
export class ReferenciaNoEncontradaError extends Error {
  constructor() {
    super("No hay ninguna persona con esa cédula en el Excel de esta sede.");
  }
}
export class MiembroYaActivadoError extends Error {
  constructor() {
    super("Esta persona ya es miembro del sistema: ajusta sus datos en su ficha.");
  }
}
export class EdicionInvalidaError extends Error {}

export interface EditarMiembroReferenciaDeps {
  referencias: IMiembroReferenciaRepository;
  miembros: IMemberRepository;
  autorizacion: IAuthorizationService;
}

export interface EditarMiembroReferenciaInput {
  organizacionId: string;
  sucursalId: string;
  cedula: string;
  usuarioId: string;
  usuarioNombre: string;
  cambios: CambiosEdicionPadron;
}

const ETIQUETAS: Record<CampoEditablePadron, string> = {
  nombre: "nombre", status: "status", fNacimiento: "fecha de nacimiento", celular: "celular",
  fVenc: "fecha de vencimiento", fechaPago: "fecha de pago", plan: "plan",
  colI: "columna I", colJ: "columna J", colK: "columna K",
};

// Microajuste de una fila del padrón (solo si la persona aún no es miembro). La cédula no se edita.
// Guarda qué campos se tocaron para que reimportar el Excel respete la edición.
export async function editarMiembroReferencia(
  deps: EditarMiembroReferenciaDeps,
  input: EditarMiembroReferenciaInput
): Promise<MiembroReferencia> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioId, "MIEMBROS", "EDITAR"))) throw new RolNoAutorizadoError();

  const referencia = await deps.referencias.buscarPorCedula(input.organizacionId, input.cedula);
  if (!referencia || referencia.sucursalId !== input.sucursalId) throw new ReferenciaNoEncontradaError();
  if (await deps.miembros.buscarPorOrganizacionYCedula(input.organizacionId, input.cedula)) throw new MiembroYaActivadoError();

  const cambiados: Record<string, string | null> = {};
  for (const campo of CAMPOS_EDITABLES_PADRON) {
    if (!(campo in input.cambios)) continue;
    const bruto = input.cambios[campo];
    const valor = bruto === undefined || bruto === null || bruto.trim() === "" ? null : bruto.trim();
    if (campo === "nombre" && valor === null) throw new EdicionInvalidaError("El nombre no puede quedar vacío.");
    if ((campo === "fNacimiento" || campo === "fVenc") && valor !== null && fechaDesdeTextoPadron(valor) === null) {
      throw new EdicionInvalidaError(`Fecha inválida en ${ETIQUETAS[campo]}: usa aaaa-mm-dd o dd/mm/aaaa.`);
    }
    if (valor !== referencia[campo]) cambiados[campo] = valor;
  }

  let resaltado: string | null | undefined;
  if (input.cambios.resaltado !== undefined) {
    if (input.cambios.resaltado !== null && !esColorResaltadoValido(input.cambios.resaltado)) {
      throw new EdicionInvalidaError("Color de resaltado no permitido.");
    }
    if (input.cambios.resaltado !== referencia.resaltado) resaltado = input.cambios.resaltado;
  }

  const tocados = Object.keys(cambiados);
  if (tocados.length === 0 && resaltado === undefined) return referencia;
  if (tocados.length === 0) {
    return deps.referencias.actualizarEdicion(referencia.id, { crudos: {}, editadoPor: input.usuarioNombre, resaltado });
  }

  const crudosFinales: CamposCrudosPadron = {
    nombre: referencia.nombre, status: referencia.status, fNacimiento: referencia.fNacimiento, celular: referencia.celular,
    fVenc: referencia.fVenc, fechaPago: referencia.fechaPago, plan: referencia.plan,
    colI: referencia.colI, colJ: referencia.colJ, colK: referencia.colK,
    ...cambiados,
  } as CamposCrudosPadron;

  return deps.referencias.actualizarEdicion(referencia.id, {
    crudos: cambiados as CambiosCrudosPadron,
    normalizados: normalizarCamposPadron(crudosFinales),
    camposEditados: [...new Set([...referencia.camposEditados, ...tocados])],
    editadoPor: input.usuarioNombre,
    ...(resaltado !== undefined && { resaltado }),
  });
}
