// GET /api/kiosco/estado — lo que el reposo del kiosco muestra: sede, última tasa BCV y la configuración
// del reposo (frases, imagen y opacidad) hecha desde el menú Kiosko del panel.
// Autenticado con la apiKey de la sucursal (ver lib/kiosco.ts).
import { NextRequest, NextResponse } from "next/server";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco, tasaBcvParaKiosco } from "@/lib/kiosco";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    return jsonKiosco(
      {
        sucursalNombre: sucursal.nombre,
        tasaBcv: await tasaBcvParaKiosco(),
        reposo: { frases: sucursal.reposoFrases, imagenUrl: sucursal.reposoImagenUrl, opacidad: sucursal.reposoOpacidad },
      },
      200
    );
  } catch (error) {
    console.error("Error en el estado del kiosco:", error);
    return jsonKiosco({ error: "Error interno al leer el estado del kiosco." }, 500);
  }
}
