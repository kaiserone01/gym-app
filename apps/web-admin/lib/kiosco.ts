// Utilidades de las rutas que consume el kiosco (/api/checkin, /api/kiosco/*).
//
// CORS: apps/kiosk se sirve desde su propio origen, distinto al de apps/web-admin — el navegador
// del kiosco hace peticiones cross-origin con un header custom (X-Kiosk-Api-Key), lo que dispara un
// preflight OPTIONS. Es seguro permitir cualquier origen acá porque la autenticación real es el
// apiKey (un header que el navegador nunca adjunta automáticamente, a diferencia de una cookie) —
// sin conocerlo, ningún origen puede hacer nada.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KioskTokenValidator } from "@gym-app/infrastructure/auth/KioskTokenValidator";
import type { Sucursal } from "@gym-app/domain/entities/Sucursal";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Kiosk-Api-Key",
};

export function jsonKiosco(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function opcionesKiosco() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// La sucursal dueña de la clave (header X-Kiosk-Api-Key, ADR-001 v1 §4.2 — el sucursalId NO viaja
// en el body), o la respuesta 401 que la ruta debe devolver tal cual.
export async function sucursalDeKiosco(req: NextRequest): Promise<Sucursal | NextResponse> {
  const apiKey = req.headers.get("x-kiosk-api-key");
  if (!apiKey) return jsonKiosco({ error: "Falta el header X-Kiosk-Api-Key." }, 401);

  const sucursal = await new KioskTokenValidator(prisma).validar(apiKey);
  if (!sucursal) return jsonKiosco({ error: "API key de sucursal inválida." }, 401);

  return sucursal;
}
