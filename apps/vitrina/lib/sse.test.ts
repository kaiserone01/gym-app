import { describe, expect, test, vi } from "vitest";
import { leerEventos, vigilarSilencio } from "./sse";

const flujoDe = (trozos: string[]) => {
  const codificador = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controlador) {
      for (const trozo of trozos) controlador.enqueue(codificador.encode(trozo));
      controlador.close();
    },
  });
};

describe("leerEventos", () => {
  test("entrega el nombre de cada evento", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["event: vitrina:cambio\ndata: 1\n\n", "event: vitrina:cambio\ndata: 2\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio", "vitrina:cambio"]);
  });

  test("ignora los comentarios (: conectado, : latido)", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe([": conectado\n\n", ": latido\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual([]);
  });

  test("junta un evento partido en varios trozos de red", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["event: vitrina:cam", "bio\nda", "ta: 1\n", "\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio"]);
  });

  test("un evento sin nombre llega como 'message'", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["data: hola\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["message"]);
  });

  test("un evento mezclado con comentarios de latido en el mismo bloque llega igual", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe([": latido\nevent: vitrina:cambio\n: otro\ndata: 1\n\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio"]);
  });

  test("un evento final sin línea en blanco se descarta", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["event: vitrina:cambio\ndata: 1\n\nevent: vitrina:cambio\ndata: 2\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio"]);
  });

  test("acepta separadores CRLF, también partidos entre trozos", async () => {
    const eventos: string[] = [];
    await leerEventos(flujoDe(["event: vitrina:cambio\r\ndata: 1\r\n\r", "\nevent: vitrina:cambio\r\n\r\n"]), (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambio", "vitrina:cambio"]);
  });

  test("un carácter multibyte partido entre trozos no rompe el evento", async () => {
    const bytes = new TextEncoder().encode("event: vitrina:cambió\n\n");
    const medio = bytes.indexOf(0xc3) + 1; // parte la "ó" por la mitad
    const flujo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, medio));
        c.enqueue(bytes.slice(medio));
        c.close();
      },
    });
    const eventos: string[] = [];
    await leerEventos(flujo, (e) => eventos.push(e));
    expect(eventos).toEqual(["vitrina:cambió"]);
  });

  test("si la lectura se corta (error o abort) la promesa rechaza", async () => {
    const flujo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("event: vitrina:cambio\n\n"));
        c.error(new Error("conexión cortada"));
      },
    });
    await expect(leerEventos(flujo, () => {})).rejects.toThrow("conexión cortada");
  });

  test("avisa de cada trozo recibido, también de los latidos", async () => {
    let trozos = 0;
    await leerEventos(flujoDe([": latido\n\n", ": latido\n\n"]), () => {}, () => trozos++);
    expect(trozos).toBe(2);
  });
});

describe("vigilarSilencio", () => {
  test("avisa si pasa el plazo sin latidos y no avisa si llegan a tiempo", () => {
    vi.useFakeTimers();
    try {
      let avisos = 0;
      const vigia = vigilarSilencio(60_000, () => avisos++);
      vi.advanceTimersByTime(50_000);
      vigia.latir();
      vi.advanceTimersByTime(50_000);
      expect(avisos).toBe(0);
      vi.advanceTimersByTime(10_000);
      expect(avisos).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("parar cancela el aviso", () => {
    vi.useFakeTimers();
    try {
      let avisos = 0;
      vigilarSilencio(60_000, () => avisos++).parar();
      vi.advanceTimersByTime(120_000);
      expect(avisos).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
