import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOMBRE_COOKIE_SESION } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaSesionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSesionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { iniciarSesion, CredencialesInvalidasError } from "@gym-app/domain/use-cases/IniciarSesion";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const usuarios = new PrismaUsuarioAdminRepository(prisma);

    // Se valida credenciales primero (reutilizando la lógica exacta de
    // iniciarSesion vía su propio caso de uso más abajo cuando ya se sabe
    // la sucursal) pero acá hace falta saber el usuario ANTES de decidir
    // si hace falta preguntar la sucursal — por eso se resuelven
    // credenciales acá, no dentro de iniciarSesion todavía.
    const credenciales = await usuarios.buscarCredencialesPorEmail(email);
    if (!credenciales || !(await hasher.comparar(password, credenciales.passwordHash))) {
      return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
    }

    const sucursalesVisibles = await obtenerSucursalesVisiblesParaUsuario(
      { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
      credenciales.usuario
    );

    if (sucursalesVisibles.length > 1) {
      // Más de una opción: no se loguea todavía (sin cookie) — se le pide
      // al cliente que elija sucursal (ver FormularioLogin/paso 2), que
      // reenvía las credenciales a /api/auth/login/sucursal (ver ese
      // archivo para por qué se reenvían en vez de usar un token
      // intermedio: evita agregar una entidad de "sesión temporal" solo
      // para cubrir un intervalo de segundos).
      const turnoRepo = new PrismaTurnoRepository(prisma);
      const sucursales = await Promise.all(
        sucursalesVisibles.map(async (s) => {
          const turnoAbierto = await turnoRepo.buscarAbiertoPorSucursal(s.id);
          const cajaAbiertaPorMi = turnoAbierto?.usuarioId === credenciales.usuario.id;
          return {
            id: s.id,
            nombre: s.nombre,
            cajaAbiertaPor: turnoAbierto?.usuarioNombre ?? null,
            cajaAbiertaPorMi,
          };
        })
      );
      return NextResponse.json({ requiereSeleccion: true, sucursales });
    }

    // Una sola sucursal visible (o ninguna, caso borde: usuario sin
    // sucursales asignadas todavía) — se loguea directo, sin preguntar.
    // sucursalesVisibles[0] no existe en el caso "ninguna"; se lo trata
    // como error explícito en vez de crear una sesión sin sucursal activa
    // válida (violaría la garantía de que sucursalActivaId siempre existe).
    if (sucursalesVisibles.length === 0) {
      return NextResponse.json(
        { error: "Tu usuario no tiene ninguna sucursal asignada. Contactá a un administrador." },
        { status: 403 }
      );
    }

    const resultado = await iniciarSesion(
      { usuarios, hasher, sesiones: new PrismaSesionRepository(prisma) },
      { email, password, sucursalActivaId: sucursalesVisibles[0].id }
    );

    const response = NextResponse.json({ requiereSeleccion: false });
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
