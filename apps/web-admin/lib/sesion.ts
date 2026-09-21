// lib/sesion.ts
// Helper para leer y validar la sesión del admin desde la cookie httpOnly.
// Cada ruta protegida llama a obtenerUsuarioDeSesion al inicio — no hay
// middleware.ts todavía (solo una ruta protegida por ahora, ver el plan).
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { validarSesion, SesionValidada } from "@gym-app/domain/use-cases/ValidarSesion";

export const NOMBRE_COOKIE_SESION = "sesion_token";

export async function obtenerUsuarioDeSesion(req: NextRequest): Promise<SesionValidada | null> {
  const token = req.cookies.get(NOMBRE_COOKIE_SESION)?.value;

  if (!token) {
    return null;
  }

  return validarSesion(
    {
      sesiones: new PrismaSesionRepository(prisma),
      usuarios: new PrismaUsuarioAdminRepository(prisma),
    },
    token
  );
}

// Igual que obtenerUsuarioDeSesion, pero para Server Components/Actions,
// que no reciben un NextRequest — leen la cookie con next/headers.
export async function obtenerUsuarioDeSesionActual(): Promise<SesionValidada | null> {
  const token = (await cookies()).get(NOMBRE_COOKIE_SESION)?.value;

  if (!token) {
    return null;
  }

  return validarSesion(
    {
      sesiones: new PrismaSesionRepository(prisma),
      usuarios: new PrismaUsuarioAdminRepository(prisma),
    },
    token
  );
}
