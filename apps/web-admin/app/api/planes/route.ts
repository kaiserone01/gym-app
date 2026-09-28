// GET  /api/planes — lista los planes de acceso de la organización del usuario en sesión.
// POST /api/planes — crea un plan nuevo (con sus sucursales de acceso, si aplica).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { crearPlan } from "@gym-app/domain/use-cases/CrearPlan";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";

// Duración fija (en días) para las 6 frecuencias con ciclo estándar — solo
// como fallback cuando el body no manda diasCiclo explícito (compatibilidad
// con clientes de esta API que todavía no lo envían). PERSONALIZADO no
// tiene entrada acá: si se manda esa frecuencia, diasCiclo es obligatorio.
const DIAS_CICLO_POR_FRECUENCIA_FIJA: Record<Exclude<FrecuenciaPago, "PERSONALIZADO">, number> = {
  DIARIO: 1,
  SEMANAL: 7,
  QUINCENAL: 15,
  MENSUAL: 30,
  SEMESTRAL: 180,
  ANUAL: 365,
};

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

    const diasCiclo = body.diasCiclo ?? DIAS_CICLO_POR_FRECUENCIA_FIJA[body.frecuencia as Exclude<FrecuenciaPago, "PERSONALIZADO">];
    if (!diasCiclo) {
      return NextResponse.json(
        { error: "diasCiclo es requerido cuando frecuencia es PERSONALIZADO." },
        { status: 400 }
      );
    }

    const plan = await crearPlan(
      { planes: new PrismaPlanRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre: body.nombre,
        frecuencia: body.frecuencia,
        diasCiclo,
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
