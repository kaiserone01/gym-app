// PATCH /api/planes/[id] — edita nombre/precioUSD, o da de baja lógica con {"activo": false}.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { actualizarPlan, PlanNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarPlan";
import type { CambiosPlan } from "@gym-app/domain/entities/Plan";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const { id } = await params;
  const body = await req.json();

  const cambios: CambiosPlan = {};
  if (body.nombre !== undefined) cambios.nombre = body.nombre;
  if (body.precioUSD !== undefined) cambios.precioUSD = body.precioUSD;
  if (body.activo !== undefined) cambios.activo = body.activo;

  try {
    const plan = await actualizarPlan(
      { planes: new PrismaPlanRepository(prisma) },
      { organizacionId: usuario.organizacionId, id, cambios }
    );

    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof PlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al actualizar plan:", error);
    return NextResponse.json({ error: "Error interno al actualizar el plan." }, { status: 500 });
  }
}
