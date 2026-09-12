// app/api/checkin/route.ts
// Endpoint de check-in: recibe una cédula, busca al miembro, calcula si está al día,
// registra el CheckIn y devuelve los datos para mostrar en pantalla.
//
// Regla de estado: si hoy es posterior a fechaVencimiento, el miembro está "vencido".
// No hay días de gracia automáticos — si el dueño negocia una extensión con el cliente,
// simplemente actualiza la fechaVencimiento del miembro desde el panel admin.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { cedula, gymId } = await req.json();

    if (!cedula || !gymId) {
      return NextResponse.json(
        { error: "Cédula y gymId son requeridos." },
        { status: 400 }
      );
    }

    // 1. Buscar al miembro por cédula dentro de ese gym
    const miembro = await prisma.miembro.findUnique({
      where: {
        gymId_cedula: {
          gymId,
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

    // 2. Calcular si está al día (comparación directa, sin días de gracia)
    const hoy = new Date();
    let estaAlDia = true;

    if (miembro.fechaVencimiento) {
      estaAlDia = hoy <= new Date(miembro.fechaVencimiento);
    } else {
      // Si no tiene fecha de vencimiento registrada, se considera no al día
      estaAlDia = false;
    }

    const estadoAlMomento = estaAlDia ? "activo" : "vencido";

    // 3. Registrar el CheckIn (historial de entradas)
    await prisma.checkIn.create({
      data: {
        gymId,
        miembroId: miembro.id,
        estadoAlMomento,
      },
    });

    // 4. Responder con los datos que la pantalla del kiosco necesita mostrar
    return NextResponse.json({
      nombre: miembro.nombre,
      fotoUrl: miembro.fotoUrl,
      fechaVencimiento: miembro.fechaVencimiento,
      entrenador: miembro.entrenador?.nombre ?? null,
      planTipo: miembro.planTipo,
      estado: estadoAlMomento, // "activo" | "vencido"
    });
  } catch (error) {
    console.error("Error en check-in:", error);
    return NextResponse.json(
      { error: "Error interno al procesar el check-in." },
      { status: 500 }
    );
  }
}