import { prisma } from "@/lib/prisma";
import { PrismaEntrenadorRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEntrenadorRepository";
import { listarEntrenadores } from "@gym-app/domain/use-cases/ListarEntrenadores";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";

// El selector de entrenador de FormularioMiembro se filtra por la sucursal
// elegida en el propio formulario (que puede cambiar sin recargar la
// página) — se precalcula un mapa sucursalId -> entrenadores para las
// sucursales visibles, y el filtrado final ocurre en el cliente.
export async function obtenerEntrenadoresPorSucursal(
  organizacionId: string,
  sucursales: SucursalResumen[]
): Promise<Record<string, EntrenadorResumen[]>> {
  const entrenadorRepo = new PrismaEntrenadorRepository(prisma);

  const listas = await Promise.all(
    sucursales.map((sucursal) => listarEntrenadores({ entrenadores: entrenadorRepo }, organizacionId, sucursal.id))
  );

  return Object.fromEntries(sucursales.map((sucursal, i) => [sucursal.id, listas[i]]));
}
