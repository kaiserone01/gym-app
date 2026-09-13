// POST /api/pagos            — registra un pago; crea/extiende la Suscripcion ACTIVA del Plan indicado.
// GET  /api/pagos?miembroId= — lista el historial de pagos de ese miembro.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import {
  registrarPago,
  MiembroNoEncontradoError as RegistrarPagoMiembroNoEncontradoError,
  PlanNoEncontradoError as RegistrarPagoPlanNoEncontradoError,
  PlanInactivoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import {
  listarPagos,
  MiembroNoEncontradoError as ListarPagosMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ListarPagos";

export async function GET(req: NextRequest) {
  const usuario = await obtenerUsuarioDeSesion(req);

  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const miembroId = req.nextUrl.searchParams.get("miembroId");
  if (!miembroId) {
    return NextResponse.json({ error: "El parámetro miembroId es requerido." }, { status: 400 });
  }

  try {
    const pagos = await listarPagos(
      { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
      { organizacionId: usuario.organizacionId, miembroId }
    );

    return NextResponse.json({ pagos });
  } catch (error) {
    if (error instanceof ListarPagosMiembroNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error al listar pagos:", error);
    return NextResponse.json({ error: "Error interno al listar los pagos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await obtenerUsuarioDeSesion(req);

    if (!usuario) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = await req.json();

    if (!body.miembroId || !body.planId || body.monto === undefined || !body.metodo) {
      return NextResponse.json(
        { error: "miembroId, planId, monto y metodo son requeridos." },
        { status: 400 }
      );
    }

    const pago = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: body.miembroId,
        planId: body.planId,
        monto: body.monto,
        metodo: body.metodo,
        tasaCambio: body.tasaCambio ?? null,
      }
    );

    return NextResponse.json(pago, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrarPagoMiembroNoEncontradoError || error instanceof RegistrarPagoPlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PlanInactivoError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error al registrar pago:", error);
    return NextResponse.json({ error: "Error interno al registrar el pago." }, { status: 500 });
  }
}
