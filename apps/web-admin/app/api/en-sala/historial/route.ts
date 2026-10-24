// GET /api/en-sala/historial?rango=hoy|24h — quién pasó por la sala (con o sin salida). Solo SOCIO.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarHistorialSala } from "@gym-app/domain/use-cases/ListarEnSala";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);
  if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (sesion.usuario.rol !== "SOCIO") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const rango = req.nextUrl.searchParams.get("rango") === "hoy" ? "hoy" : "24h";
  const personas = await listarHistorialSala(
    {
      checkIns: new PrismaCheckInRepository(prisma),
      suscripciones: new PrismaSuscripcionRepository(prisma),
      sucursales: new PrismaSucursalRepository(prisma),
    },
    { organizacionId: sesion.usuario.organizacionId, sucursalId: sesion.sucursalActivaId, rango }
  );
  return NextResponse.json({ personas }, { headers: { "Cache-Control": "no-store" } });
}
