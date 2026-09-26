// Script manual (no hay framework de tests en el repo todavía) para verificar
// las reglas de negocio de la tasa BCV contra un repositorio en memoria y un
// servicio falso: corre `npx tsx scripts/verificar-tasa-bcv.ts` desde
// apps/web-admin. Mismo patrón que scripts/verificar-autorizacion.ts.
import assert from "node:assert/strict";
import {
  obtenerTasaVigente,
  SinTasaDisponibleError,
} from "@gym-app/domain/use-cases/ObtenerTasaVigente";
import { sincronizarTasas } from "@gym-app/domain/use-cases/SincronizarTasas";
import type { ITasaCambioRepository } from "@gym-app/domain/ports/ITasaCambioRepository";
import type { IExchangeRateService, ResultadoPublicadas } from "@gym-app/domain/ports/IExchangeRateService";
import type { TasaCambio } from "@gym-app/domain/entities/TasaCambio";
import { crearOrquestadorTasa, validarTasaCobro, type TasaVigenteFresca } from "../lib/tasaBcv";

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

  constructor(iniciales: Array<{ fecha: Date; valor: number }> = []) {
    this.filas = iniciales.map((t, i) => ({
      id: `fake-${i}`,
      fecha: t.fecha,
      valor: t.valor,
      fuente: "BCV",
      registradoPorId: null,
      createdAt: new Date(),
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
    for (const t of tasas) {
      await this.guardar(t.fecha, t.valor, fuente);
    }
    return tasas.length;
  }
}

class ServicioFalso implements IExchangeRateService {
  llamadas = 0;
  constructor(private resultado: ResultadoPublicadas | (() => ResultadoPublicadas)) {}
  async obtenerPublicadas(): Promise<ResultadoPublicadas> {
    this.llamadas++;
    return typeof this.resultado === "function" ? this.resultado() : this.resultado;
  }
}

class ServicioQueFalla implements IExchangeRateService {
  async obtenerPublicadas(): Promise<ResultadoPublicadas> {
    throw new Error("dolarapi.com respondió 500");
  }
}

async function main() {
  // --- Casos de obtenerTasaVigente (Tarea 1.9, Step 1) ---
  const V24 = 854.4637;
  const V25 = 855.6625;
  const V28 = 857.0058;

  await caso("1: Vie 25, antes de publicación, filas 24+25 → 855.6625 AL_DIA", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-24"), valor: V24 },
      { fecha: fecha("2026-09-25"), valor: V25 },
    ]);
    const r = await obtenerTasaVigente({ tasas }, fecha("2026-09-25"));
    assert.equal(r.tasa.valor, V25);
    assert.equal(r.estado, "AL_DIA");
  });

  await caso("2: Vie 25, después de publicación, filas 24+25+28 → 857.0058 AL_DIA (no se difiere)", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-24"), valor: V24 },
      { fecha: fecha("2026-09-25"), valor: V25 },
      { fecha: fecha("2026-09-28"), valor: V28 },
    ]);
    const r = await obtenerTasaVigente({ tasas }, fecha("2026-09-25"));
    assert.equal(r.tasa.valor, V28);
    assert.equal(r.estado, "AL_DIA");
  });

  await caso("3: Sáb 26, filas 25+28 → 857.0058 AL_DIA", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-25"), valor: V25 },
      { fecha: fecha("2026-09-28"), valor: V28 },
    ]);
    const r = await obtenerTasaVigente({ tasas }, fecha("2026-09-26"));
    assert.equal(r.tasa.valor, V28);
    assert.equal(r.estado, "AL_DIA");
  });

  await caso("4: Lun 28, filas 25+28 → 857.0058 AL_DIA", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-25"), valor: V25 },
      { fecha: fecha("2026-09-28"), valor: V28 },
    ]);
    const r = await obtenerTasaVigente({ tasas }, fecha("2026-09-28"));
    assert.equal(r.tasa.valor, V28);
    assert.equal(r.estado, "AL_DIA");
  });

  await caso("5: Mar 29 sin sincronizar desde el viernes, filas 25+28 → 857.0058 DESACTUALIZADA", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-25"), valor: V25 },
      { fecha: fecha("2026-09-28"), valor: V28 },
    ]);
    const r = await obtenerTasaVigente({ tasas }, fecha("2026-09-29"));
    assert.equal(r.tasa.valor, V28);
    assert.equal(r.estado, "DESACTUALIZADA");
  });

  await caso("6: Lun 28 feriado, el viernes se publicó la del martes 29=860, filas 25+29 → 860 AL_DIA", async () => {
    const tasas = new RepositorioEnMemoria([
      { fecha: fecha("2026-09-25"), valor: V25 },
      { fecha: fecha("2026-09-29"), valor: 860 },
    ]);
    const r = await obtenerTasaVigente({ tasas }, fecha("2026-09-28"));
    assert.equal(r.tasa.valor, 860);
    assert.equal(r.estado, "AL_DIA");
  });

  await caso("7: tabla vacía → lanza SinTasaDisponibleError", async () => {
    const tasas = new RepositorioEnMemoria([]);
    await assert.rejects(() => obtenerTasaVigente({ tasas }, fecha("2026-09-26")), SinTasaDisponibleError);
  });

  // --- Casos de sincronizarTasas (Tarea 1.9, Step 2) ---
  await caso("8: base hasta el 22, servicio publica 15..28 → guarda 15..28 dentro de ventana (22-7), tasa en curso 857.0058", async () => {
    const tasas = new RepositorioEnMemoria([{ fecha: fecha("2026-09-22"), valor: 852.4168 }]);
    const dias = [
      ["2026-09-15", 840],
      ["2026-09-16", 841],
      ["2026-09-17", 842],
      ["2026-09-18", 843],
      ["2026-09-19", 844],
      ["2026-09-22", 852.4168],
      ["2026-09-23", 853],
      ["2026-09-24", V24],
      ["2026-09-25", V25],
      ["2026-09-28", V28],
    ] as const;
    const servicio = new ServicioFalso({
      tipo: "CAMBIOS",
      version: "etag-1",
      tasas: dias.map(([f, v]) => ({ fecha: fecha(f), valor: v })),
    });
    const r = await sincronizarTasas({ servicioTasa: servicio, tasas }, { versionConocida: null, hoy: fecha("2026-09-26") });
    assert.equal(r.estado, "ACTUALIZADO");
    assert.equal(r.guardadas, dias.length);
    const vigente = await tasas.obtenerUltima();
    assert.equal(vigente?.valor, V28);
  });

  await caso("9: segunda corrida SIN_CAMBIOS → 0 escrituras, versión se mantiene", async () => {
    const tasas = new RepositorioEnMemoria([{ fecha: fecha("2026-09-28"), valor: V28 }]);
    const servicio = new ServicioFalso({ tipo: "SIN_CAMBIOS" });
    const r = await sincronizarTasas({ servicioTasa: servicio, tasas }, { versionConocida: "etag-1", hoy: fecha("2026-09-29") });
    assert.equal(r.estado, "SIN_CAMBIOS");
    assert.equal(r.guardadas, 0);
    assert.equal(r.version, "etag-1");
  });

  await caso("10: el servicio lanza error → se propaga, repositorio queda intacto", async () => {
    const tasas = new RepositorioEnMemoria([{ fecha: fecha("2026-09-28"), valor: V28 }]);
    const servicio = new ServicioQueFalla();
    await assert.rejects(() => sincronizarTasas({ servicioTasa: servicio, tasas }, { versionConocida: null, hoy: fecha("2026-09-29") }));
    assert.equal(tasas.filas.length, 1);
  });

  await caso("11: filas inválidas (promedio inválido, fecha mal formada) se descartan sin lanzar", async () => {
    const tasas = new RepositorioEnMemoria([{ fecha: fecha("2026-09-22"), valor: 852.4168 }]);
    const servicio = new ServicioFalso({
      tipo: "CAMBIOS",
      version: "etag-2",
      tasas: [
        { fecha: fecha("2026-09-23"), valor: 853 },
        { fecha: fecha("2026-09-24"), valor: Number.NaN },
        { fecha: fecha("2026-09-25"), valor: V25 },
      ],
    });
    const r = await sincronizarTasas({ servicioTasa: servicio, tasas }, { versionConocida: null, hoy: fecha("2026-09-26") });
    assert.equal(r.guardadas, 2);
  });

  // --- Casos del orquestador (Tarea 2.4) ---
  function crearFakes(opciones: {
    hoy: Date;
    tasaInicial: number;
    fechaInicial: Date;
    delaySincronizacionMs?: number;
    fallaSincronizacion?: boolean;
  }) {
    const tasas = new RepositorioEnMemoria([{ fecha: opciones.fechaInicial, valor: opciones.tasaInicial }]);
    let llamadasSincronizar = 0;
    // Arranca ya por encima del throttle (45 min) — como el primer request
    // del día, donde el throttle interno (ultimoIntento=0) siempre está vencido.
    let relojMs = 60 * 60_000;
    const tareasProgramadas: Array<() => Promise<unknown>> = [];

    async function sincronizar(versionConocida: string | null): Promise<{ version: string | null }> {
      llamadasSincronizar++;
      if (opciones.delaySincronizacionMs) {
        await new Promise((r) => setTimeout(r, opciones.delaySincronizacionMs));
      }
      if (opciones.fallaSincronizacion) {
        throw new Error("dolarapi.com respondió 500");
      }
      // Simula que la sincronización trae la tasa del día "hoy" (recién publicada).
      const r = await sincronizarTasas(
        {
          servicioTasa: new ServicioFalso({
            tipo: "CAMBIOS",
            version: "etag-x",
            tasas: [{ fecha: opciones.hoy, valor: opciones.tasaInicial }],
          }),
          tasas,
        },
        { versionConocida, hoy: opciones.hoy }
      );
      return { version: r.version };
    }

    const orquestador = crearOrquestadorTasa({
      sincronizar,
      obtenerVigente: () => obtenerTasaVigente({ tasas }, opciones.hoy),
      programar: (tarea) => tareasProgramadas.push(tarea),
      ahoraMs: () => relojMs,
    });

    return {
      orquestador,
      tareasProgramadas,
      avanzarReloj: (ms: number) => { relojMs += ms; },
      get llamadasSincronizar() { return llamadasSincronizar; },
      tasas,
    };
  }

  await caso("12: dos llamadas dentro de 45 min → una sola sincronización", async () => {
    const f = crearFakes({ hoy: fecha("2026-09-29"), tasaInicial: V28, fechaInicial: fecha("2026-09-28") });
    // fecha valor 28, hoy 29 → DESACTUALIZADA, dispara sincronización bloqueante en la primera llamada.
    await f.orquestador.obtenerTasaVigenteFresca();
    await f.orquestador.obtenerTasaVigenteFresca();
    assert.equal(f.llamadasSincronizar, 1);
  });

  await caso("13: DESACTUALIZADA → espera a la sincronización y devuelve la tasa nueva", async () => {
    const f = crearFakes({ hoy: fecha("2026-09-29"), tasaInicial: V28, fechaInicial: fecha("2026-09-28") });
    const r = await f.orquestador.obtenerTasaVigenteFresca();
    assert.equal(f.llamadasSincronizar, 1);
    assert.equal(r.estado, "AL_DIA");
  });

  await caso("14: sincronización lenta (> 2.5s) → devuelve la guardada sin esperar más", async () => {
    const f = crearFakes({
      hoy: fecha("2026-09-29"),
      tasaInicial: V28,
      fechaInicial: fecha("2026-09-28"),
      delaySincronizacionMs: 3000,
    });
    const inicio = Date.now();
    const r = await f.orquestador.obtenerTasaVigenteFresca();
    const transcurrido = Date.now() - inicio;
    assert.ok(transcurrido < 2900, `debía devolver antes de 2.9s, tardó ${transcurrido}ms`);
    assert.equal(r.tasa.valor, V28);
  });

  await caso("15: cinco llamadas simultáneas con throttle vencido → una sola llamada al servicio (single-flight)", async () => {
    const f = crearFakes({ hoy: fecha("2026-09-29"), tasaInicial: V28, fechaInicial: fecha("2026-09-28") });
    await Promise.all([
      f.orquestador.obtenerTasaVigenteFresca(),
      f.orquestador.obtenerTasaVigenteFresca(),
      f.orquestador.obtenerTasaVigenteFresca(),
      f.orquestador.obtenerTasaVigenteFresca(),
      f.orquestador.obtenerTasaVigenteFresca(),
    ]);
    assert.equal(f.llamadasSincronizar, 1);
  });

  await caso("16: sincronización fallida no actualiza la versión conocida", async () => {
    const f = crearFakes({
      hoy: fecha("2026-09-29"),
      tasaInicial: V28,
      fechaInicial: fecha("2026-09-28"),
      fallaSincronizacion: true,
    });
    // No debe propagar el error (se atrapa y loguea) ni romper la lectura.
    const r = await f.orquestador.obtenerTasaVigenteFresca();
    assert.equal(r.tasa.valor, V28);
    assert.equal(f.llamadasSincronizar, 1);
    // Segunda llamada con throttle vencido (forzado) debe reintentar — la versión conocida sigue null.
    await f.orquestador.obtenerTasaVigenteFresca({ forzar: true });
    assert.equal(f.llamadasSincronizar, 2);
  });

  await caso("17: forzar:true ignora el throttle y espera a la sincronización", async () => {
    const f = crearFakes({ hoy: fecha("2026-09-26"), tasaInicial: V28, fechaInicial: fecha("2026-09-28") });
    // fecha valor 28, hoy 26 → AL_DIA (no dispararía por sí sola dentro del throttle).
    await f.orquestador.obtenerTasaVigenteFresca({ forzar: true });
    assert.equal(f.llamadasSincronizar, 1);
    await f.orquestador.obtenerTasaVigenteFresca({ forzar: true });
    assert.equal(f.llamadasSincronizar, 2);
  });

  await caso("18: forzar:true con sincronización fallida → sincronizacionFallida:true, devuelve la tasa guardada, no propaga", async () => {
    const f = crearFakes({
      hoy: fecha("2026-09-26"),
      tasaInicial: V28,
      fechaInicial: fecha("2026-09-28"),
      fallaSincronizacion: true,
    });
    const r = await f.orquestador.obtenerTasaVigenteFresca({ forzar: true });
    assert.equal(r.sincronizacionFallida, true);
    assert.equal(r.tasa.valor, V28);
  });

  // --- Casos de validarTasaCobro (Tarea 3.1) ---
  function fresca(valor: number, sincronizacionFallida = false): TasaVigenteFresca {
    return {
      tasa: { id: "fake", fecha: fecha("2026-09-26"), valor, fuente: "BCV", registradoPorId: null, createdAt: new Date() },
      estado: "AL_DIA",
      sincronizacionFallida,
    };
  }

  await caso("19: tasa del formulario coincide → ok:true con la tasa del servidor", () => {
    const r = validarTasaCobro(V28, fresca(V28));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.tasa, V28);
  });

  await caso("20: tasa del formulario coincide dentro de la tolerancia de redondeo (4 decimales)", () => {
    const r = validarTasaCobro(857.00579999, fresca(857.0058));
    assert.equal(r.ok, true);
  });

  await caso("21: tasa del formulario difiere → ok:false con tasaNueva", () => {
    const r = validarTasaCobro(V28, fresca(860));
    assert.equal(r.ok, false);
    if (!r.ok && "tasaNueva" in r) assert.equal(r.tasaNueva, 860);
  });

  await caso("22: sincronización falló al forzar → ok:false con fallaTemporal y tasaGuardada", () => {
    const r = validarTasaCobro(V28, fresca(V28, true));
    assert.equal(r.ok, false);
    if (!r.ok && "fallaTemporal" in r) {
      assert.equal(r.fallaTemporal, true);
      assert.equal(r.tasaGuardada, V28);
    } else {
      assert.fail("se esperaba fallaTemporal");
    }
  });

  console.log(`\n${pasadas === total ? "OK" : "FALLÓ"} (${pasadas}/${total})`);
  process.exit(pasadas === total ? 0 : 1);
}

main();
