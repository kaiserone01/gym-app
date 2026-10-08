"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { editarMiembroReferencia } from "@gym-app/domain/use-cases/EditarMiembroReferencia";
import type { CambiosCrudosPadron } from "@gym-app/domain/utils/padronExcel";

// Los errores de dominio (en español) se dejan propagar para que el cliente los muestre con useFeedback.
export async function editarFilaPadronAction(cedula: string, cambios: CambiosCrudosPadron): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  await editarMiembroReferencia(
    {
      referencias: new PrismaMiembroReferenciaRepository(prisma),
      miembros: new PrismaMemberRepository(prisma),
      autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
    },
    { organizacionId: usuario.organizacionId, sucursalId: sucursalActivaId, cedula, usuarioId: usuario.id, usuarioNombre: usuario.nombre, cambios }
  );

  revalidatePath("/excel");
}
