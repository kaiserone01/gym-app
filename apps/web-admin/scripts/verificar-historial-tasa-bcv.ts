// Script manual (no hay framework de tests en el repo todavía) para verificar
// las reglas del historial de tasa BCV: corre
// `npx tsx scripts/verificar-historial-tasa-bcv.ts` desde apps/web-admin.
import assert from "node:assert/strict";
import { registrarTasaManual, TasaInvalidaError } from "@gym-app/domain/use-cases/RegistrarTasaManual";
import type { ITasaCambioRepository } from "@gym-app/domain/ports/ITasaCambioRepository";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";

let pasadas = 0;
let total = 0;

function caso(nombre: string, fn: () => void | Promise<void>) {
  total++;
  return Promise.resolve(fn())
    .then(() => {
      pasadas++;
      console.log(`✅ ${nombre}`);
    })
    .catch((error) => {
      console.error(`❌ ${nombre}`);
      console.error(error);
    });
}

function fecha(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

class RepositorioEnMemoria implements ITasaCambioRepository {
  filas: TasaCambio[] = [];

  constructor(iniciales: Array<{ fecha: Date; valor: number; fuente?: string; registradoPorId?: string | null; createdAt?: Date }> = []) {
    this.filas = iniciales.map((t, i) => ({
      id: `fake-${i}`,
      fecha: t.fecha,
      valor: t.valor,
      fuente: t.fuente ?? "BCV",
      registradoPorId: t.registradoPorId ?? null,
      createdAt: t.createdAt ?? new Date(),
    }));
  }

  async guardar(fecha: Date, valor: number, fuente: string, registradoPorId: string | null = null): Promise<TasaCambio> {
    const existente = this.filas.find((f) => f.fecha.getTime() === fecha.getTime());
    if (existente) {
      existente.valor = valor;
      existente.fuente = fuente;
      existente.registradoPorId = registradoPorId;
      return existente;
    }
    const nueva: TasaCambio = { id: `fake-${this.filas.length}`, fecha, valor, fuente, registradoPorId, createdAt: new Date() };
    this.filas.push(nueva);
    return nueva;
  }

  async obtenerUltima(): Promise<TasaCambio | null> {
    if (this.filas.length === 0) return null;
    return [...this.filas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
  }

  async guardarVarias(tasas: Array<{ fecha: Date; valor: number }>, fuente: string): Promise<number> {
    for (const t of tasas) await this.guardar(t.fecha, t.valor, fuente);
    return tasas.length;
  }
}

async function main() {
  await caso("1: registrarTasaManual guarda con el registradoPorId dado", async () => {
    const tasas = new RepositorioEnMemoria([]);
    const resultado = await registrarTasaManual({ tasas }, { valor: 860, registradoPorId: "usuario-1" });
    assert.equal(resultado.registradoPorId, "usuario-1");
    assert.equal(resultado.fuente, "MANUAL");
  });

  await caso("2: registrarTasaManual rechaza valor <= 0", async () => {
    const tasas = new RepositorioEnMemoria([]);
    await assert.rejects(
      () => registrarTasaManual({ tasas }, { valor: 0, registradoPorId: "usuario-1" }),
      TasaInvalidaError
    );
  });

  console.log(`\n${pasadas === total ? "OK" : "FALLÓ"} (${pasadas}/${total})`);
  process.exit(pasadas === total ? 0 : 1);
}

main();
