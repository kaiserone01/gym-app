// GET  /api/miembros — lista los miembros de la organización del usuario en sesión.
// POST /api/miembros — crea un miembro nuevo en esa misma organización.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { crearMiembro, CedulaDuplicadaError } from "@gym-app/domain/use-cases/CrearMiembro";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const miembros = await listarMiembros(
    { miembros: new PrismaMemberRepository(prisma) },
    usuario.organizacionId
  );

  return NextResponse.json({ miembros });
}

export async function POST(req: NextRequest) {
  try {
    const sesion = await obtenerUsuarioDeSesion(req);

    if (!sesion) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const { usuario } = sesion;

    const body = await req.json();

    if (!body.nombre || !body.cedula || !body.sucursalId || body.precioPlan === undefined) {
      return NextResponse.json(
        { error: "nombre, cedula, sucursalId y precioPlan son requeridos." },
        { status: 400 }
      );
    }

    const miembro = await crearMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        sucursalId: body.sucursalId,
        nombre: body.nombre,
        cedula: body.cedula,
        fechaInscripcion: body.fechaInscripcion ? new Date(body.fechaInscripcion) : null,
        fechaNacimiento: body.fechaNacimiento ? new Date(body.fechaNacimiento) : null,
        celular: body.celular ?? null,
        fotoUrl: body.fotoUrl ?? null,
        entrenadorId: body.entrenadorId ?? null,
        planId: body.planId ?? null,
        precioPlan: body.precioPlan,
      }
    );

    return NextResponse.json(miembro, { status: 201 });
  } catch (error) {
    if (error instanceof CedulaDuplicadaError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error al crear miembro:", error);
    return NextResponse.json(
      { error: "Error interno al crear el miembro." },
      { status: 500 }
    );
  }
}
