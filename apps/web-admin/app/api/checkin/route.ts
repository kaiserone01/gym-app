// app/api/checkin/route.ts
// Endpoint de check-in: recibe una cédula y el id de la sucursal física, busca al
// miembro dentro de la organización dueña de esa sucursal, calcula si está al día,
// registra el CheckIn (o responde con uno reciente ya existente) y devuelve los
// datos para mostrar en pantalla.
//
// Regla de estado: si hoy es posterior a fechaVencimiento, el miembro está "vencido".
// (Nota: esta regla usa Miembro.fechaVencimiento sin cambios; la validación de acceso
// por Plan/Suscripcion —ValidarAccesoSucursalPorPlan— es trabajo del plan de dominio
// hexagonal, no de este cambio.)
//
// Idempotencia (ADR-001 v2 §13.4, aprobada): si ya existe un CheckIn del mismo
// miembro en esta sucursal dentro de la ventana, se responde con ese registro en
// vez de crear uno nuevo.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VENTANA_IDEMPOTENCIA_MINUTOS = 2;

export async function POST(req: NextRequest) {
  try {
    const { cedula, sucursalId } = await req.json();

    if (!cedula || !sucursalId) {
      return NextResponse.json(
        { error: "Cédula y sucursalId son requeridos." },
        { status: 400 }
      );
    }

    // 1. Resolver la Sucursal → su Organización (el tenant nunca viene directo del body)
    const sucursal = await prisma.sucursal.findUnique({
      where: { id: sucursalId },
    });

    if (!sucursal) {
      return NextResponse.json(
        { error: "Sucursal no encontrada." },
        { status: 404 }
      );
    }

    // 2. Buscar al miembro por cédula dentro de esa organización
    const miembro = await prisma.miembro.findUnique({
      where: {
        organizacionId_cedula: {
          organizacionId: sucursal.organizacionId,
          cedula,
        },
      },
      include: {
        entrenador: true,
      },
    });

    if (!miembro) {
      return NextResponse.json(
        { error: "No se encontró ningún miembro con esa cédula." },
        { status: 404 }
      );
    }

    // 3. Idempotencia: ¿ya hay un CheckIn reciente de este miembro en esta sucursal?
    const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
    const checkInExistente = await prisma.checkIn.findFirst({
      where: {
        miembroId: miembro.id,
        sucursalId: sucursal.id,
        fechaHora: { gte: desde },
      },
      orderBy: { fechaHora: "desc" },
    });

    if (checkInExistente) {
      return NextResponse.json({
        nombre: miembro.nombre,
        fotoUrl: miembro.fotoUrl,
        fechaVencimiento: miembro.fechaVencimiento,
        entrenador: miembro.entrenador?.nombre ?? null,
        planTipo: miembro.planTipo,
        estado: checkInExistente.estadoAlMomento,
      });
    }

    // 4. Calcular si está al día (comparación directa, sin días de gracia)
    const hoy = new Date();
    let estaAlDia = true;

    if (miembro.fechaVencimiento) {
      estaAlDia = hoy <= new Date(miembro.fechaVencimiento);
    } else {
      estaAlDia = false;
    }

    const estadoAlMomento = estaAlDia ? "activo" : "vencido";

    // 5. Registrar el CheckIn (historial de entradas)
    await prisma.checkIn.create({
      data: {
        sucursalId: sucursal.id,
        miembroId: miembro.id,
        estadoAlMomento,
      },
    });

    // 6. Responder con los datos que la pantalla del kiosco necesita mostrar
    return NextResponse.json({
      nombre: miembro.nombre,
      fotoUrl: miembro.fotoUrl,
      fechaVencimiento: miembro.fechaVencimiento,
      entrenador: miembro.entrenador?.nombre ?? null,
      planTipo: miembro.planTipo,
      estado: estadoAlMomento,
    });
  } catch (error) {
    console.error("Error en check-in:", error);
    return NextResponse.json(
      { error: "Error interno al procesar el check-in." },
      { status: 500 }
    );
  }
}
