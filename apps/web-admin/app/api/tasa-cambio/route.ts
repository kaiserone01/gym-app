// GET /api/tasa-cambio — devuelve la última tasa de cambio guardada
// (la actualiza apps/worker, no esta ruta).
import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { orquestadorTasa } from "@/lib/tasaBcv";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // ?fecha=yyyy-mm-dd: la tasa BCV de ese día (o la más cercana anterior) — para pagos con fecha pasada.
  const fecha = req.nextUrl.searchParams.get("fecha");
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    }
    const tasa = await new PrismaTasaCambioRepository(prisma).buscarMasCercanaAnterior(new Date(`${fecha}T12:00:00`));
    if (!tasa) return NextResponse.json({ error: "No hay tasa para esa fecha." }, { status: 404 });
    return NextResponse.json({ valor: tasa.valor, fecha: tasa.fecha });
  }

  try {
    const { tasa, estado } = await orquestadorTasa.obtenerTasaVigenteFresca();

    return NextResponse.json({ ...tasa, estado });
  } catch (error) {
    if (error instanceof SinTasaDisponibleError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al obtener la tasa de cambio:", error);
    return NextResponse.json({ error: "Error interno al obtener la tasa de cambio." }, { status: 500 });
  }
}
