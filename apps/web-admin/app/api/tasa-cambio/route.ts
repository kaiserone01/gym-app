// GET /api/tasa-cambio — devuelve la última tasa de cambio guardada
// (la actualiza apps/worker, no esta ruta).
import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { orquestadorTasa } from "@/lib/tasaBcv";
import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
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
