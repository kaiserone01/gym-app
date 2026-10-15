import { describe, expect, it } from "vitest";
import { idVideoActivo, msPorTurno } from "./rotarVideo";

describe("rotarVideo", () => {
  it("sin videos no hay activo", () => {
    expect(idVideoActivo([], 3)).toBeNull();
  });
  it("rota entre las columnas con video", () => {
    expect([0, 1, 2, 3].map((t) => idVideoActivo(["a", "b", "c"], t))).toEqual(["a", "b", "c", "a"]);
  });
  it("un solo video siempre es el activo", () => {
    expect(idVideoActivo(["a"], 5)).toBe("a");
  });
  it("reparte la duración entre los videos", () => {
    expect(msPorTurno(12, 3)).toBe(4000);
    expect(msPorTurno(12, 0)).toBe(12000);
  });
});
