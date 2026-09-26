// GET  /api/planes — lista los planes de acceso de la organización del usuario en sesión.
// POST /api/planes — crea un plan nuevo (con sus sucursales de acceso, si aplica).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { crearPlan } from "@gym-app/domain/use-cases/CrearPlan";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId);

  return NextResponse.json({ planes });
}

export async function POST(req: NextRequest) {
  try {
    const sesion = await obtenerUsuarioDeSesion(req);

    if (!sesion) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const { usuario } = sesion;

    const body = await req.json();

    if (!body.nombre || !body.frecuencia || body.precioUSD === undefined) {
      return NextResponse.json(
        { error: "nombre, frecuencia y precioUSD son requeridos." },
        { status: 400 }
      );
    }

    const plan = await crearPlan(
      { planes: new PrismaPlanRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre: body.nombre,
        frecuencia: body.frecuencia,
        incluyeEntrenador: body.incluyeEntrenador ?? false,
        precioUSD: body.precioUSD,
        multisede: body.multisede ?? false,
        permitePagoParcial: body.permitePagoParcial ?? true,
        minimoAbonoTipo: body.minimoAbonoTipo ?? null,
        minimoAbonoValor: body.minimoAbonoValor ?? null,
      }
    );

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error("Error al crear plan:", error);
    return NextResponse.json({ error: "Error interno al crear el plan." }, { status: 500 });
  }
}
