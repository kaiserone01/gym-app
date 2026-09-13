// app/api/checkin/route.ts
// Endpoint de check-in: el kiosco se autentica con su apiKey de Sucursal
// (header X-Kiosk-Api-Key, ADR-001 v1 §4.2 — el sucursalId ya NO viaja en
// el body). Este handler solo valida entrada/salida HTTP; toda la lógica
// de negocio vive en el caso de uso RegistrarCheckIn (packages/domain).
//
// CORS: apps/kiosk se sirve desde su propio origen, distinto al de
// apps/web-admin — el navegador del kiosco hace un POST cross-origin con
// un header custom (X-Kiosk-Api-Key), lo que dispara un preflight OPTIONS.
// Es seguro permitir cualquier origen acá porque la autenticación real es
// el apiKey (un header que el navegador nunca adjunta automáticamente, a
// diferencia de una cookie) — sin conocerlo, ningún origen puede hacer nada.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KioskTokenValidator } from "@gym-app/infrastructure/auth/KioskTokenValidator";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { registrarCheckIn, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/RegistrarCheckIn";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Kiosk-Api-Key",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-kiosk-api-key");

    if (!apiKey) {
      return json({ error: "Falta el header X-Kiosk-Api-Key." }, 401);
    }

    const kioskAuth = new KioskTokenValidator(prisma);
    const sucursal = await kioskAuth.validar(apiKey);

    if (!sucursal) {
      return json({ error: "API key de sucursal inválida." }, 401);
    }

    const { cedula } = await req.json();

    if (!cedula) {
      return json({ error: "Cédula es requerida." }, 400);
    }

    const resultado = await registrarCheckIn(
      {
        miembros: new PrismaMemberRepository(prisma),
        checkIns: new PrismaCheckInRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
      },
      { organizacionId: sucursal.organizacionId, sucursalId: sucursal.id, cedula }
    );

    return json(
      {
        nombre: resultado.nombre,
        fotoUrl: resultado.fotoUrl,
        entrenador: resultado.entrenadorNombre,
        planTipo: resultado.planTipo,
        estado: resultado.estado,
      },
      200
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return json({ error: error.message }, 404);
    }
    console.error("Error en check-in:", error);
    return json({ error: "Error interno al procesar el check-in." }, 500);
  }
}
