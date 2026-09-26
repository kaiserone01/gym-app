import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ITasaCambioRepository } from "@gym-app/domain/ports/ITasaCambioRepository";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";

// dolarapi.com devuelve fechaActualizacion normalizada a medianoche hora
// Venezuela (-04:00), que siempre cae en el mismo día calendario en UTC
// (VET nunca cruza medianoche UTC hacia el día siguiente). Se normaliza acá
// de todos modos para que el @@unique de "fecha" en TasaCambio funcione como
// "un registro por día", sin depender de que la fuente siempre mande la hora
// exacta en 00:00:00.
function inicioDelDia(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

type FilaTasaCambio = {
  id: string;
  fecha: Date;
  valor: { toNumber(): number };
  fuente: string;
};

function mapear(fila: FilaTasaCambio): TasaCambio {
  return {
    id: fila.id,
    fecha: fila.fecha,
    valor: fila.valor.toNumber(),
    fuente: fila.fuente,
  };
}

export class PrismaTasaCambioRepository implements ITasaCambioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async guardar(fecha: Date, valor: number, fuente: string): Promise<TasaCambio> {
    const dia = inicioDelDia(fecha);

    const tasa = await this.prisma.tasaCambio.upsert({
      where: { fecha: dia },
      create: { fecha: dia, valor, fuente },
      update: { valor, fuente },
    });

    return mapear(tasa);
  }

  async obtenerUltima(): Promise<TasaCambio | null> {
    const tasa = await this.prisma.tasaCambio.findFirst({
      orderBy: { fecha: "desc" },
    });

    if (!tasa) return null;

    return mapear(tasa);
  }

  async guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number> {
    if (tasas.length === 0) return 0;

    await this.prisma.$transaction(
      tasas.map((t) => {
        const dia = inicioDelDia(t.fecha);
        return this.prisma.tasaCambio.upsert({
          where: { fecha: dia },
          create: { fecha: dia, valor: t.valor, fuente },
          update: { valor: t.valor, fuente },
        });
      })
    );

    return tasas.length;
  }
}
