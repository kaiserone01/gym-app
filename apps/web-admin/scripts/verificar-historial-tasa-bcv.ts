// Script manual (no hay framework de tests en el repo todavía) para verificar
// las reglas del historial de tasa BCV: corre
// `npx tsx scripts/verificar-historial-tasa-bcv.ts` desde apps/web-admin.
import assert from "node:assert/strict";
import { registrarTasaManual, TasaInvalidaError } from "@gym-app/domain/use-cases/RegistrarTasaManual";
import { listarHistoricoTasas } from "@gym-app/domain/use-cases/ListarHistoricoTasas";
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

  async listarHistorico(input: { antesDe: Date | null; limite: number }): Promise<TasaCambio[]> {
    const ordenadas = [...this.filas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    const filtradas = input.antesDe ? ordenadas.filter((f) => f.fecha.getTime() < input.antesDe!.getTime()) : ordenadas;
    return filtradas.slice(0, input.limite);
  }

  async buscarPorFecha(fecha: Date): Promise<TasaCambio | null> {
    return this.filas.find((f) => f.fecha.getTime() === fecha.getTime()) ?? null;
  }

  async buscarMasCercanaAnterior(fecha: Date): Promise<TasaCambio | null> {
    const candidatas = this.filas.filter((f) => f.fecha.getTime() <= fecha.getTime());
    if (candidatas.length === 0) return null;
    return [...candidatas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
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

  await caso("3: listarHistoricoTasas modo recientes, primera página sin antesDe", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-20"), valor: 800 },
      { fecha: fecha("2026-09-21"), valor: 810 },
      { fecha: fecha("2026-09-22"), valor: 820 },
    ]);
    const r = await listarHistoricoTasas({ tasas }, { modo: "recientes", antesDe: null, limite: 2 });
    assert.equal(r.filas.length, 2);
    assert.equal(r.filas[0].valor, 820);
    assert.equal(r.filas[1].valor, 810);
    assert.equal(r.hayMas, true);
  });

  await caso("4: listarHistoricoTasas modo recientes, siguiente página con antesDe agota la lista (hayMas:false)", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-20"), valor: 800 },
      { fecha: fecha("2026-09-21"), valor: 810 },
      { fecha: fecha("2026-09-22"), valor: 820 },
    ]);
    const r = await listarHistoricoTasas({ tasas }, { modo: "recientes", antesDe: fecha("2026-09-21"), limite: 2 });
    assert.equal(r.filas.length, 1);
    assert.equal(r.filas[0].valor, 800);
    assert.equal(r.hayMas, false);
  });

  await caso("5: listarHistoricoTasas modo fecha, encuentra la fila exacta", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-22"), valor: 820, fuente: "BCV" },
    ]);
    const r = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha: fecha("2026-09-22") });
    assert.equal(r.tipo, "ENCONTRADA");
    if (r.tipo === "ENCONTRADA") assert.equal(r.tasa.valor, 820);
  });

  await caso("6: listarHistoricoTasas modo fecha, sin fila exacta, devuelve la más cercana anterior", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-19"), valor: 790 },
      { fecha: fecha("2026-09-22"), valor: 820 },
    ]);
    const r = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha: fecha("2026-09-25") });
    assert.equal(r.tipo, "NO_ENCONTRADA");
    if (r.tipo === "NO_ENCONTRADA") assert.equal(r.masCercanaAnterior?.valor, 820);
  });

  await caso("7: listarHistoricoTasas modo fecha, sin fila exacta y sin ninguna anterior", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-22"), valor: 820 },
    ]);
    const r = await listarHistoricoTasas({ tasas }, { modo: "fecha", fecha: fecha("2026-09-19") });
    assert.equal(r.tipo, "NO_ENCONTRADA");
    if (r.tipo === "NO_ENCONTRADA") assert.equal(r.masCercanaAnterior, null);
  });

  console.log(`\n${pasadas === total ? "OK" : "FALLÓ"} (${pasadas}/${total})`);
  process.exit(pasadas === total ? 0 : 1);
}

main();
