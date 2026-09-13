import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { iniciarSesion, CredencialesInvalidasError } from "@gym-app/domain/use-cases/IniciarSesion";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son requeridos." },
        { status: 400 }
      );
    }

    const resultado = await iniciarSesion(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        hasher: new BcryptPasswordHasher(),
        sesiones: new PrismaSesionRepository(prisma),
      },
      { email, password }
    );

    const response = NextResponse.json({
      usuario: {
        id: resultado.usuario.id,
        email: resultado.usuario.email,
        rol: resultado.usuario.rol,
      },
    });

    response.cookies.set(NOMBRE_COOKIE_SESION, resultado.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: resultado.expiraEn,
    });

    return response;
  } catch (error) {
    if (error instanceof CredencialesInvalidasError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error en login:", error);
    return NextResponse.json(
      { error: "Error interno al iniciar sesión." },
      { status: 500 }
    );
  }
}
