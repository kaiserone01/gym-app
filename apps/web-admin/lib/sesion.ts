// lib/sesion.ts
// Helper para leer y validar la sesión del admin desde la cookie httpOnly.
// Cada ruta protegida llama a obtenerUsuarioDeSesion al inicio — no hay
// middleware.ts todavía (solo una ruta protegida por ahora, ver el plan).
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { validarSesion } from "@gym-app/domain/use-cases/ValidarSesion";
import { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

export const NOMBRE_COOKIE_SESION = "sesion_token";

export async function obtenerUsuarioDeSesion(req: NextRequest): Promise<UsuarioAdmin | null> {
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
