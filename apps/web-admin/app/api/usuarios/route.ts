// app/api/usuarios/route.ts
// Crea un UsuarioAdmin nuevo — protegido por sesión. La regla de quién puede
// crear a quién vive en AuthorizationService (packages/domain), no aquí.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";

export async function POST(req: NextRequest) {
  try {
    const solicitante = await obtenerUsuarioDeSesion(req);

    if (!solicitante) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { email, password, rol, sucursalId } = await req.json();

    if (!email || !password || !rol) {
      return NextResponse.json(
        { error: "email, password y rol son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash(password);

    const creado = await crearUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        autorizacion: new AuthorizationService(),
      },
      {
        solicitante: { rol: solicitante.rol },
        organizacionId: solicitante.organizacionId,
        sucursalId: sucursalId ?? null,
        email,
        passwordHash,
        rol,
      }
    );

    return NextResponse.json(
      { id: creado.id, email: creado.email, rol: creado.rol },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof NoAutorizadoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Error al crear usuario admin:", error);
    return NextResponse.json(
      { error: "Error interno al crear el usuario." },
      { status: 500 }
    );
  }
}
