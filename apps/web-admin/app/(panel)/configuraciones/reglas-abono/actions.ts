"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { TipoMinimoAbono } from "@gym-app/domain/entities/ReglaAbono";

export interface EstadoReglaAbono {
  error?: string;
}

export async function actualizarReglaAbonoAction(
  frecuencia: FrecuenciaPago,
  _estadoPrevio: EstadoReglaAbono,
  formData: FormData
): Promise<EstadoReglaAbono> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;
  if (usuario.rol !== "SOCIO") {
    return { error: "Solo el socio puede configurar las reglas de abono." };
  }

  const activo = formData.get("activo")?.toString() === "on";
  const tipo = formData.get("tipo")?.toString() as TipoMinimoAbono | undefined;
  const valor = Number(formData.get("valor"));

  if (activo) {
    if (!tipo || Number.isNaN(valor) || valor < 0) {
      return { error: "Tipo y valor son requeridos." };
    }
    if (tipo === "PORCENTAJE" && valor > 100) {
      return { error: "El porcentaje no puede ser mayor a 100." };
    }
  }

  await new PrismaReglaAbonoRepository(prisma).upsert(usuario.organizacionId, frecuencia, {
    activo,
    tipo: tipo ?? "DIAS",
    valor: Number.isNaN(valor) ? 0 : valor,
  });

  revalidatePath("/configuraciones/reglas-abono");
  return {};
}
