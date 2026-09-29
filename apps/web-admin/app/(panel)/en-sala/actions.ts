"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { tienePermisoEnSala } from "@/lib/permisoEnSala";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { marcarSalidaCheckIn } from "@gym-app/domain/use-cases/MarcarSalidaCheckIn";

export async function marcarSalidaAction(miembroId: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!(await tienePermisoEnSala(sesion.usuario, "EDITAR"))) throw new Error("No tienes permiso para marcar salidas.");

  await marcarSalidaCheckIn(
    { checkIns: new PrismaCheckInRepository(prisma) },
    { sucursalId: sesion.sucursalActivaId, miembroId }
  );
}
