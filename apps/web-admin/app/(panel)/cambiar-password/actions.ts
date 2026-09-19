"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import {
  cambiarPassword,
  PasswordActualIncorrectaError,
  PasswordNuevaInvalidaError,
} from "@gym-app/domain/use-cases/CambiarPassword";

export interface EstadoFormularioCambiarPassword {
  error?: string;
  ok?: boolean;
}

function deps() {
  return { usuarios: new PrismaUsuarioAdminRepository(prisma), hasher: new BcryptPasswordHasher() };
}

export async function cambiarPasswordAction(
  _estadoPrevio: EstadoFormularioCambiarPassword,
  formData: FormData
): Promise<EstadoFormularioCambiarPassword> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const passwordActual = formData.get("passwordActual")?.toString() ?? "";
  const passwordNueva = formData.get("passwordNueva")?.toString() ?? "";
  const passwordConfirmar = formData.get("passwordConfirmar")?.toString() ?? "";

  if (passwordNueva !== passwordConfirmar) {
    return { error: "Las contraseñas nuevas no coinciden." };
  }

  try {
    await cambiarPassword(deps(), { usuarioId: usuario.id, passwordActual, passwordNueva });
  } catch (error) {
    if (error instanceof PasswordActualIncorrectaError || error instanceof PasswordNuevaInvalidaError) {
      return { error: error.message };
    }
    throw error;
  }

  return { ok: true };
}
