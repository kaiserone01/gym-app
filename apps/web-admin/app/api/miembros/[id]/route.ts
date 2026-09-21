// GET   /api/miembros/[id] — detalle de un miembro (solo si pertenece a la
//                            organización del usuario en sesión).
// PATCH /api/miembros/[id] — edita campos, o da de baja lógica con {"activo": false}.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import {
  obtenerMiembro,
  MiembroNoEncontradoError as ObtenerMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ObtenerMiembro";
import {
  actualizarMiembro,
  MiembroNoEncontradoError as ActualizarMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ActualizarMiembro";
import type { CambiosMiembro } from "@gym-app/domain/entities/Miembro";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const { id } = await params;

  try {
    const miembro = await obtenerMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, id }
    );

    return NextResponse.json(miembro);
  } catch (error) {
    if (error instanceof ObtenerMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al obtener miembro:", error);
    return NextResponse.json(
      { error: "Error interno al obtener el miembro." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const { id } = await params;
  const body = await req.json();

  const cambios: CambiosMiembro = {};
  if (body.nombre !== undefined) cambios.nombre = body.nombre;
  if (body.sucursalId !== undefined) cambios.sucursalId = body.sucursalId;
  if (body.fechaInscripcion !== undefined) {
    cambios.fechaInscripcion = body.fechaInscripcion ? new Date(body.fechaInscripcion) : null;
  }
  if (body.fechaNacimiento !== undefined) {
    cambios.fechaNacimiento = body.fechaNacimiento ? new Date(body.fechaNacimiento) : null;
  }
  if (body.celular !== undefined) cambios.celular = body.celular;
  if (body.fotoUrl !== undefined) cambios.fotoUrl = body.fotoUrl;
  if (body.entrenadorId !== undefined) cambios.entrenadorId = body.entrenadorId;
  if (body.planId !== undefined) cambios.planId = body.planId;
  if (body.precioPlan !== undefined) cambios.precioPlan = body.precioPlan;
  if (body.activo !== undefined) cambios.activo = body.activo;

  try {
    const miembro = await actualizarMiembro(
      {
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
      },
      { organizacionId: usuario.organizacionId, id, cambios }
    );

    return NextResponse.json(miembro);
  } catch (error) {
    if (error instanceof ActualizarMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al actualizar miembro:", error);
    return NextResponse.json(
      { error: "Error interno al actualizar el miembro." },
      { status: 500 }
    );
  }
}
