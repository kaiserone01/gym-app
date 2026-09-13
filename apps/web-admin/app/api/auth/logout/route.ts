import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { cerrarSesion } from "@gym-app/domain/use-cases/CerrarSesion";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(NOMBRE_COOKIE_SESION)?.value;

  if (token) {
    await cerrarSesion({ sesiones: new PrismaSesionRepository(prisma) }, token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(NOMBRE_COOKIE_SESION);
  return response;
}
