// app/api/checkin/route.ts
// Endpoint de check-in: el kiosco se autentica con su apiKey de Sucursal
// (header X-Kiosk-Api-Key, ADR-001 v1 §4.2 — el sucursalId ya NO viaja en
// el body). Este handler solo valida entrada/salida HTTP; toda la lógica
// de negocio vive en el caso de uso RegistrarCheckIn (packages/domain).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KioskTokenValidator } from "@gym-app/infrastructure/auth/KioskTokenValidator";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { registrarCheckIn, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/RegistrarCheckIn";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-kiosk-api-key");

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta el header X-Kiosk-Api-Key." },
        { status: 401 }
      );
    }

    const kioskAuth = new KioskTokenValidator(prisma);
    const sucursal = await kioskAuth.validar(apiKey);

    if (!sucursal) {
      return NextResponse.json(
        { error: "API key de sucursal inválida." },
        { status: 401 }
      );
    }

    const { cedula } = await req.json();

    if (!cedula) {
      return NextResponse.json(
        { error: "Cédula es requerida." },
        { status: 400 }
      );
    }

    const resultado = await registrarCheckIn(
      {
        miembros: new PrismaMemberRepository(prisma),
        checkIns: new PrismaCheckInRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
      },
      { organizacionId: sucursal.organizacionId, sucursalId: sucursal.id, cedula }
    );

    return NextResponse.json({
      nombre: resultado.nombre,
      fotoUrl: resultado.fotoUrl,
      entrenador: resultado.entrenadorNombre,
      planTipo: resultado.planTipo,
      estado: resultado.estado,
    });
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error en check-in:", error);
    return NextResponse.json(
      { error: "Error interno al procesar el check-in." },
      { status: 500 }
    );
  }
}
