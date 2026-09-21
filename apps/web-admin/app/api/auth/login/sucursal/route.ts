// POST /api/auth/login/sucursal — paso 2 del login, solo cuando el paso 1
// (POST /api/auth/login) respondió requiereSeleccion: true. Recibe de
// nuevo email+password (no hay sesión ni token intermedio entre los dos
// pasos — ver la nota en api/auth/login/route.ts) más la sucursalId
// elegida, revalida credenciales y crea recién ahí la sesión.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { iniciarSesion, CredencialesInvalidasError } from "@gym-app/domain/use-cases/IniciarSesion";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";

export async function POST(req: NextRequest) {
  try {
    const { email, password, sucursalId } = await req.json();

    if (!email || !password || !sucursalId) {
      return NextResponse.json(
        { error: "Email, contraseña y sucursal son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const usuarios = new PrismaUsuarioAdminRepository(prisma);
    const credenciales = await usuarios.buscarCredencialesPorEmail(email);
    if (!credenciales || !(await hasher.comparar(password, credenciales.passwordHash))) {
      return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
    }

    // No confiar en el sucursalId que manda el cliente sin validar que
    // esté entre las que este usuario puede ver (mismo criterio que
    // /api/caja/ultimo-cierre) — evita que alguien fuerce una sucursal
    // ajena editando el body del POST.
    const sucursalesVisibles = await obtenerSucursalesVisiblesParaUsuario(
      { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
      credenciales.usuario
    );
    if (!sucursalesVisibles.some((s) => s.id === sucursalId)) {
      return NextResponse.json({ error: "Sucursal no accesible." }, { status: 403 });
    }

    const resultado = await iniciarSesion(
      { usuarios, hasher, sesiones: new PrismaSesionRepository(prisma) },
      { email, password, sucursalActivaId: sucursalId }
    );

    const response = NextResponse.json({
      usuario: { id: resultado.usuario.id, email: resultado.usuario.email, rol: resultado.usuario.rol },
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
    console.error("Error en login (paso sucursal):", error);
    return NextResponse.json(
      { error: "Error interno al iniciar sesión." },
      { status: 500 }
    );
  }
}
