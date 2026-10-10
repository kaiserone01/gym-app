"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import {
  editarMiembroReferencia,
  EdicionInvalidaError,
  MiembroYaActivadoError,
  ReferenciaNoEncontradaError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/EditarMiembroReferencia";
import { CAMPOS_EDITABLES_PADRON, estaActivoEnPadron, type CambiosEdicionPadron } from "@gym-app/domain/utils/padronExcel";
import { activarMiembroEnTransaccion } from "@/lib/activacion";
import { aFilaGrid, type FilaGrid } from "./tiposGrid";

type ResultadoEdicion = { fila: FilaGrid } | { error: string };

const esTextoONulo = (valor: unknown) => valor == null || typeof valor === "string";

function cambiosValidos(cambios: unknown): cambios is CambiosEdicionPadron {
  if (typeof cambios !== "object" || cambios === null || Array.isArray(cambios)) return false;
  const registro = cambios as Record<string, unknown>;
  return CAMPOS_EDITABLES_PADRON.every((campo) => esTextoONulo(registro[campo])) && esTextoONulo(registro.resaltado);
}

// Los errores de dominio (en español) se devuelven como { error }: Next.js oculta el mensaje de los errores lanzados en producción.
// Sin revalidatePath: el cliente reemplaza la fila devuelta en su estado local.
async function editarFila(cedula: unknown, cambios: unknown): Promise<ResultadoEdicion> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  if (typeof cedula !== "string" || !cambiosValidos(cambios)) return { error: "Datos de edición inválidos." };

  try {
    const referencia = await editarMiembroReferencia(
      {
        referencias: new PrismaMiembroReferenciaRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      { organizacionId: usuario.organizacionId, sucursalId: sucursalActivaId, cedula, usuarioId: usuario.id, usuarioNombre: usuario.nombre, cambios }
    );
    // Solo se editan filas de quien aún no es miembro.
    return { fila: aFilaGrid(referencia, null) };
  } catch (error) {
    if (
      error instanceof RolNoAutorizadoError ||
      error instanceof ReferenciaNoEncontradaError ||
      error instanceof MiembroYaActivadoError ||
      error instanceof EdicionInvalidaError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function editarFilaPadronAction(cedula: string, cambios: CambiosEdicionPadron): Promise<ResultadoEdicion> {
  return editarFila(cedula, cambios);
}

export async function resaltarFilaPadronAction(cedula: string, color: string | null): Promise<ResultadoEdicion> {
  return editarFila(cedula, { resaltado: color });
}

const MAX_LOTE_ACTIVACION = 25;

// Inserta en Miembros (por regularizar, sin pago) a quienes el Excel marca como activos. Se llama por lotes desde la
// cuadrícula; cada cédula se revalida en el servidor (padrón de esta sede + estatus activo) y la activación es idempotente.
export async function activarActivosPadronAction(cedulas: string[]): Promise<{ activados: { cedula: string; miembroId: string }[] } | { error: string }> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  if (!Array.isArray(cedulas) || cedulas.length > MAX_LOTE_ACTIVACION || !cedulas.every((c) => typeof c === "string")) {
    return { error: "Lote de activación inválido." };
  }
  if (!(await new AuthorizationService(new PrismaPermisoRepository(prisma)).tienePermiso(usuario.id, "MIEMBROS", "EDITAR"))) {
    return { error: "No tienes permiso para activar miembros." };
  }

  const referencias = new PrismaMiembroReferenciaRepository(prisma);
  const activados: { cedula: string; miembroId: string }[] = [];
  try {
    for (const cedula of cedulas) {
      const referencia = await referencias.buscarPorCedula(usuario.organizacionId, cedula);
      if (!referencia || referencia.sucursalId !== sucursalActivaId || !estaActivoEnPadron(referencia.status)) continue;
      const miembro = await activarMiembroEnTransaccion({ organizacionId: usuario.organizacionId, sucursalId: sucursalActivaId, cedula });
      if (miembro) activados.push({ cedula, miembroId: miembro.id });
    }
  } catch {
    return { error: "No se pudo activar a todos. Vuelve a intentarlo: los ya insertados no se duplican." };
  }
  return { activados };
}
