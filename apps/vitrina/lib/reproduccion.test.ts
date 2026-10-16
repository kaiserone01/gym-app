import { describe, expect, it } from "vitest";
import { colaAgotada, colaDeVideos, ESTANCADO_MS, evaluarVideo, msParaAvanzar, siguienteTurno, techoDiapositivaMs, TOPE_VIDEO_MS, ultimoAvance } from "./reproduccion";

const e = (id: string, mediaTipo: "IMAGEN" | "VIDEO", mostrarMedio = true) => ({ id, mediaTipo, mostrarMedio });

describe("colaDeVideos", () => {
  it("solo los videos visibles, en orden de columna", () => {
    expect(colaDeVideos([e("a", "VIDEO"), e("b", "IMAGEN"), e("c", "VIDEO")])).toEqual(["a", "c"]);
  });
  it("ignora el video de quien oculta el medio", () => {
    expect(colaDeVideos([e("a", "VIDEO", false), e("b", "VIDEO")])).toEqual(["b"]);
  });
  it("sin videos la cola está vacía", () => {
    expect(colaDeVideos([e("a", "IMAGEN")])).toEqual([]);
  });
});

describe("siguienteTurno", () => {
  it("avanza al siguiente video", () => {
    expect(siguienteTurno(0, 2, false)).toEqual({ posicion: 1, terminada: false });
  });
  it("tras el último termina la cola", () => {
    expect(siguienteTurno(1, 2, false)).toEqual({ posicion: 2, terminada: true });
  });
  it("en una diapositiva única la cola vuelve al primero", () => {
    expect(siguienteTurno(1, 2, true)).toEqual({ posicion: 0, terminada: false });
    expect(siguienteTurno(0, 1, true)).toEqual({ posicion: 0, terminada: false });
  });
});

describe("msParaAvanzar", () => {
  const base = { conVideo: true, esFranja: false, videosTerminados: false, huboFallo: false, transcurridoMs: 0, duracionSeg: 10 };
  it("sin video usa la duración", () => {
    expect(msParaAvanzar({ ...base, conVideo: false, transcurridoMs: 4000 })).toBe(6000);
    expect(msParaAvanzar({ ...base, conVideo: false, transcurridoMs: 12000 })).toBe(0);
  });
  it("cartel con video espera al fin del video, aunque pase la duración", () => {
    expect(msParaAvanzar({ ...base, transcurridoMs: 90_000 })).toBeNull();
  });
  it("cartel: un video corto avanza al terminar, sin esperar la duración", () => {
    expect(msParaAvanzar({ ...base, videosTerminados: true, transcurridoMs: 3000 })).toBe(0);
  });
  it("cartel cuyo video falló muestra el póster hasta cumplir la duración", () => {
    expect(msParaAvanzar({ ...base, videosTerminados: true, huboFallo: true, transcurridoMs: 2000 })).toBe(8000);
  });
  it("franja: tras el último video exige al menos la duración", () => {
    const franja = { ...base, esFranja: true };
    expect(msParaAvanzar({ ...franja, videosTerminados: true, transcurridoMs: 3000 })).toBe(7000);
    expect(msParaAvanzar({ ...franja, videosTerminados: true, transcurridoMs: 60_000 })).toBe(0);
    expect(msParaAvanzar({ ...franja, transcurridoMs: 60_000 })).toBeNull();
  });
});

describe("evaluarVideo", () => {
  const base = { ahoraMs: 1000, inicioMs: 0, ultimoAvanceMs: 0, conTope: true };
  it("sigue mientras avanza", () => {
    expect(evaluarVideo(base)).toBe("SEGUIR");
  });
  it("se salta si el currentTime no avanza durante 20 s", () => {
    expect(evaluarVideo({ ...base, ahoraMs: ESTANCADO_MS - 1 })).toBe("SEGUIR");
    expect(evaluarVideo({ ...base, ahoraMs: ESTANCADO_MS })).toBe("ESTANCADO");
  });
  it("tope absoluto de 10 min aunque avance", () => {
    expect(evaluarVideo({ ...base, ahoraMs: TOPE_VIDEO_MS, ultimoAvanceMs: TOPE_VIDEO_MS - 500 })).toBe("TOPE");
  });
  it("en bucle no hay tope", () => {
    expect(evaluarVideo({ ...base, conTope: false, ahoraMs: TOPE_VIDEO_MS, ultimoAvanceMs: TOPE_VIDEO_MS - 500 })).toBe("SEGUIR");
  });
});

describe("ultimoAvance", () => {
  it("se actualiza solo si el tiempo cambió", () => {
    expect(ultimoAvance(1, 2, 5000, 1000)).toBe(5000);
    expect(ultimoAvance(2, 2, 5000, 1000)).toBe(1000);
  });
});

describe("colaAgotada (cola que se acorta con un video en curso)", () => {
  it("posición fuera de rango en una cola con videos: agotada", () => {
    expect(colaAgotada(2, 1)).toBe(true);
    expect(colaAgotada(1, 1)).toBe(true);
  });
  it("posición dentro de rango: no", () => {
    expect(colaAgotada(0, 2)).toBe(false);
  });
  it("cola vacía: no hay nada que agotar (la franja usa duracionSeg)", () => {
    expect(colaAgotada(0, 0)).toBe(false);
    expect(msParaAvanzar({ conVideo: false, esFranja: true, videosTerminados: false, huboFallo: false, transcurridoMs: 2000, duracionSeg: 10 })).toBe(8000);
  });
});

describe("techoDiapositivaMs", () => {
  it("10 min por video más la duración", () => {
    expect(techoDiapositivaMs(2, 10)).toBe(2 * TOPE_VIDEO_MS + 10_000);
  });
  it("cuenta al menos un video", () => {
    expect(techoDiapositivaMs(0, 5)).toBe(TOPE_VIDEO_MS + 5000);
  });
});

describe("casos adicionales", () => {
  it("el tope de 10 min tiene prioridad sobre el estancamiento", () => {
    expect(evaluarVideo({ ahoraMs: TOPE_VIDEO_MS, inicioMs: 0, ultimoAvanceMs: 0, conTope: true })).toBe("TOPE");
  });
  it("franja con un video fallido: igual exige el mínimo de duracionSeg", () => {
    const franja = { conVideo: true, esFranja: true, videosTerminados: true, huboFallo: true, duracionSeg: 10 };
    expect(msParaAvanzar({ ...franja, transcurridoMs: 1000 })).toBe(9000);
    expect(msParaAvanzar({ ...franja, transcurridoMs: 15_000 })).toBe(0);
  });
  it("cola de 2 videos + 1 foto recorrida desde el inicio hasta terminar", () => {
    const cola = colaDeVideos([e("a", "VIDEO"), e("foto", "IMAGEN"), e("b", "VIDEO")]);
    expect(cola).toEqual(["a", "b"]);
    let turno = { posicion: 0, terminada: false };
    const pasos: number[] = [turno.posicion];
    while (!turno.terminada) {
      turno = siguienteTurno(turno.posicion, cola.length, false);
      pasos.push(turno.posicion);
    }
    expect(pasos).toEqual([0, 1, 2]);
  });
  it("siguienteTurno con cola vacía termina o se queda en 0", () => {
    expect(siguienteTurno(0, 0, false)).toEqual({ posicion: 0, terminada: true });
    expect(siguienteTurno(0, 0, true)).toEqual({ posicion: 0, terminada: false });
  });
});
