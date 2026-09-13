// GET /api/tasa-cambio — devuelve la última tasa de cambio guardada
// (la actualiza apps/worker, no esta ruta).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { obtenerTasaActual, SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaActual";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const tasa = await obtenerTasaActual({ tasas: new PrismaTasaCambioRepository(prisma) });

    return NextResponse.json(tasa);
  } catch (error) {
    if (error instanceof SinTasaDisponibleError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al obtener la tasa de cambio:", error);
    return NextResponse.json({ error: "Error interno al obtener la tasa de cambio." }, { status: 500 });
  }
}
