// GET /api/kiosco/vitrina — el manifiesto de la vitrina de TV: ítems activos no vencidos (los futuros incluidos),
// ajustes de la sede, la última tasa BCV (misma forma que /api/kiosco/estado) y la hora del servidor.
// Autenticado con la apiKey de la sucursal (ver lib/kiosco.ts).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco, tasaBcvParaKiosco } from "@/lib/kiosco";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { armarManifiesto } from "@gym-app/domain/services/manifiestoVitrina";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    const repositorio = new PrismaVitrinaRepository(prisma);
    const [items, ajustes, tasaBcv] = await Promise.all([
      repositorio.listar(sucursal.id),
      repositorio.obtenerAjustes(sucursal.id),
      tasaBcvParaKiosco(),
    ]);

    return jsonKiosco(armarManifiesto({ items, ajustes, tasaBcv, ahora: new Date() }), 200);
  } catch (error) {
    console.error("Error en el manifiesto de la vitrina:", error);
    return jsonKiosco({ error: "Error interno al leer la vitrina." }, 500);
  }
}
