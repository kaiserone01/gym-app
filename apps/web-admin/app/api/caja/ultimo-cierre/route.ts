// GET /api/caja/ultimo-cierre?sucursalId=... — el último cierre de caja
// (efectivo contado) de esa sucursal, para sugerir el fondo inicial del
// próximo turno en FormularioAbrirTurno. Se consulta desde el cliente
// porque cuando el operador tiene que elegir sucursal (SOCIO con varias
// sedes visibles) no se sabe cuál es hasta que la elige en el <select>.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { obtenerUltimoCierrePorSucursal } from "@gym-app/domain/use-cases/ObtenerUltimoCierrePorSucursal";
import { obtenerSucursalesVisiblesParaTurno } from "../../../(panel)/caja/obtenerSucursalesVisiblesParaTurno";
// (api/caja/ultimo-cierre/route.ts -> ../../../(panel)/caja/... =
// app/(panel)/caja/obtenerSucursalesVisiblesParaTurno.ts)

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);
  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const sucursalId = req.nextUrl.searchParams.get("sucursalId");
  if (!sucursalId) {
    return NextResponse.json({ error: "sucursalId es requerido." }, { status: 400 });
  }

  // No confiar en cualquier sucursalId del cliente — solo entre las que
  // este usuario puede ver (mismo criterio que al abrir turno).
  const visibles = await obtenerSucursalesVisiblesParaTurno(usuario);
  if (!visibles.some((s) => s.id === sucursalId)) {
    return NextResponse.json({ error: "Sucursal no accesible." }, { status: 403 });
  }

  const cierre = await obtenerUltimoCierrePorSucursal(
    { turnos: new PrismaTurnoRepository(prisma), arqueo: new PrismaArqueoRepository(prisma) },
    { sucursalId }
  );

  return NextResponse.json(cierre);
}
