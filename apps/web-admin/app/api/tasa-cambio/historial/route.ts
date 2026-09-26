// GET /api/tasa-cambio/historial — historial de TasaCambio para el modal
// del badge (ver ModalHistorialTasas). Dos modos: "recientes" (paginado por
// cursor de fecha) y "fecha" (búsqueda exacta con fallback a la más
// cercana anterior).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { listarHistoricoTasas } from "@gym-app/domain/use-cases/ListarHistoricoTasas";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";

const LIMITE_DEFECTO = 20;

interface FilaHistorial {
  fecha: string;
  valor: number;
  fuente: string;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
  createdAt: string;
}

async function mapearConNombres(filas: TasaCambio[]): Promise<FilaHistorial[]> {
  const ids = [...new Set(filas.map((f) => f.registradoPorId).filter((id): id is string => id !== null))];
  const usuarios = ids.length
    ? await prisma.usuarioAdmin.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
    : [];
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));

  return filas.map((f) => ({
    fecha: f.fecha.toISOString(),
    valor: f.valor,
    fuente: f.fuente,
    registradoPorId: f.registradoPorId,
    registradoPorNombre: f.registradoPorId ? (nombrePorId.get(f.registradoPorId) ?? null) : null,
    createdAt: f.createdAt.toISOString(),
  }));
}

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);
  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fechaParam = searchParams.get("fecha");
  const tasas = new PrismaTasaCambioRepository(prisma);

  if (fechaParam) {
    const fecha = new Date(`${fechaParam}T00:00:00Z`);
    const resultado = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha });
    if (resultado.tipo === "ENCONTRADA") {
      const [fila] = await mapearConNombres([resultado.tasa]);
      return NextResponse.json({ tipo: "ENCONTRADA", tasa: fila });
    }
    const masCercanaAnterior = resultado.masCercanaAnterior
      ? (await mapearConNombres([resultado.masCercanaAnterior]))[0]
      : null;
    return NextResponse.json({ tipo: "NO_ENCONTRADA", masCercanaAnterior });
  }

  const antesDeParam = searchParams.get("antesDe");
  const antesDe = antesDeParam ? new Date(antesDeParam) : null;
  const limite = Number(searchParams.get("limite")) || LIMITE_DEFECTO;

  const { filas, hayMas } = await listarHistoricoTasas({ tasas }, { modo: "recientes", antesDe, limite });
  return NextResponse.json({ filas: await mapearConNombres(filas), hayMas });
}
