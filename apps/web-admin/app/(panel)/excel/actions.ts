"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
import { CAMPOS_EDITABLES_PADRON, type CambiosCrudosPadron } from "@gym-app/domain/utils/padronExcel";

function cambiosValidos(cambios: unknown): cambios is CambiosCrudosPadron {
  if (typeof cambios !== "object" || cambios === null || Array.isArray(cambios)) return false;
  const registro = cambios as Record<string, unknown>;
  return CAMPOS_EDITABLES_PADRON.every((campo) => registro[campo] == null || typeof registro[campo] === "string");
}

// Los errores de dominio (en español) se devuelven como { error }: Next.js oculta el mensaje de los errores lanzados en producción.
export async function editarFilaPadronAction(cedula: string, cambios: CambiosCrudosPadron): Promise<{ error?: string }> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  if (typeof cedula !== "string" || !cambiosValidos(cambios)) return { error: "Datos de edición inválidos." };

  try {
    await editarMiembroReferencia(
      {
        referencias: new PrismaMiembroReferenciaRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      { organizacionId: usuario.organizacionId, sucursalId: sucursalActivaId, cedula, usuarioId: usuario.id, usuarioNombre: usuario.nombre, cambios }
    );
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

  revalidatePath("/excel");
  return {};
}
