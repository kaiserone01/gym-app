// POST /api/pagos            — registra un pago; crea/extiende la Suscripcion ACTIVA del Plan indicado.
// GET  /api/pagos            — lista todos los pagos de la organización (más reciente primero).
// GET  /api/pagos?miembroId= — lista el historial de pagos de ese miembro.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import {
  registrarPago,
  MiembroNoEncontradoError as RegistrarPagoMiembroNoEncontradoError,
  MiembroFueraDeSucursalError,
  PlanNoEncontradoError as RegistrarPagoPlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import {
  listarPagos,
  MiembroNoEncontradoError as ListarPagosMiembroNoEncontradoError,
} from "@gym-app/domain/use-cases/ListarPagos";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);

  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { usuario } = sesion;

  const miembroId = req.nextUrl.searchParams.get("miembroId") ?? undefined;

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
    const sesion = await obtenerUsuarioDeSesion(req);

    if (!sesion) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const { usuario, sucursalActivaId } = sesion;

    const body = await req.json();

    if (!body.miembroId || !body.planId || body.monto === undefined || !body.metodo) {
      return NextResponse.json(
        { error: "miembroId, planId, monto y metodo son requeridos." },
        { status: 400 }
      );
    }

    // sucursalActivaId siempre existe para una sesión válida (garantizado
    // por Sesion.sucursalActivaId, ver plan de selección de sucursal al
    // iniciar sesión) — este chequeo queda como guardia defensiva de tipos,
    // no debería ser alcanzable en la práctica.
    if (!sucursalActivaId) {
      return NextResponse.json(
        { error: "El usuario no tiene una sucursal asignada para registrar pagos." },
        { status: 400 }
      );
    }

    // Esta ruta API sigue siendo de una sola línea (no soporta pago
    // combinado desde afuera todavía) — se envuelve el monto/método plano
    // en un array de una sola línea para calzar con la nueva firma de
    // registrarPago.
    const pagos = await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: body.miembroId,
        planId: body.planId,
        lineas: [
          {
            monto: body.monto,
            metodo: body.metodo,
            metodoPagoId: body.metodoPagoId ?? null,
            numeroOperacion: body.numeroOperacion ?? null,
            tasaCambio: body.tasaCambio ?? null,
          },
        ],
        sucursalId: sucursalActivaId,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );

    return NextResponse.json(pagos[0], { status: 201 });
  } catch (error) {
    if (error instanceof RegistrarPagoMiembroNoEncontradoError || error instanceof RegistrarPagoPlanNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof MiembroFueraDeSucursalError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof PlanInactivoError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RolNoAutorizadoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Error al registrar pago:", error);
    return NextResponse.json({ error: "Error interno al registrar el pago." }, { status: 500 });
  }
}
