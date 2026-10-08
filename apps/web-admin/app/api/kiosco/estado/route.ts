// GET /api/kiosco/estado — lo que el reposo del kiosco muestra: sede y última tasa BCV.
// Autenticado con la apiKey de la sucursal (ver lib/kiosco.ts).
import { NextRequest, NextResponse } from "next/server";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco } from "@/lib/kiosco";
import { orquestadorTasa } from "@/lib/tasaBcv";
import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    // Sin tasa guardada el reposo se ve igual, solo que sin ese dato.
    let tasaBcv: { valor: number; fecha: string } | null = null;
    try {
      const { tasa } = await orquestadorTasa.obtenerTasaVigenteFresca();
      tasaBcv = { valor: tasa.valor, fecha: tasa.fecha.toISOString() };
    } catch (error) {
      if (!(error instanceof SinTasaDisponibleError)) console.error("Error al leer la tasa para el kiosco:", error);
    }

    return jsonKiosco({ sucursalNombre: sucursal.nombre, tasaBcv }, 200);
  } catch (error) {
    console.error("Error en el estado del kiosco:", error);
    return jsonKiosco({ error: "Error interno al leer el estado del kiosco." }, 500);
  }
}
