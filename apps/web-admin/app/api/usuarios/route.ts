// app/api/usuarios/route.ts
// Crea un UsuarioAdmin nuevo — protegido por sesión. La regla de quién puede
// crear a quién vive en AuthorizationService (packages/domain), no aquí.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { BcryptPasswordHasher } from "@gym-app/infrastructure/auth/BcryptPasswordHasher";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";
import { listarUsuariosAdmin } from "@gym-app/domain/use-cases/ListarUsuariosAdmin";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const usuarios = await listarUsuariosAdmin(
    { usuarios: new PrismaUsuarioAdminRepository(prisma) },
    usuario.organizacionId
  );

  return NextResponse.json({ usuarios });
}

export async function POST(req: NextRequest) {
  try {
    const solicitante = await obtenerUsuarioDeSesion(req);

    if (!solicitante) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { nombre, email, password, rol, sucursalId, sucursalIds } = await req.json();

    if (!nombre || !email || !password || !rol) {
      return NextResponse.json(
        { error: "nombre, email, password y rol son requeridos." },
        { status: 400 }
      );
    }

    const hasher = new BcryptPasswordHasher();
    const passwordHash = await hasher.hash(password);

    const creado = await crearUsuarioAdmin(
      {
        usuarios: new PrismaUsuarioAdminRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
        permisos: new PrismaPermisoRepository(prisma),
        usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma),
      },
      {
        solicitante: { rol: solicitante.rol },
        organizacionId: solicitante.organizacionId,
        sucursalId: sucursalId ?? null,
        sucursalIds: sucursalIds ?? [],
        nombre,
        email,
        passwordHash,
        rol,
      }
    );

    return NextResponse.json(
      { id: creado.id, nombre: creado.nombre, email: creado.email, rol: creado.rol },
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
