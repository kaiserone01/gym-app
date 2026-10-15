import { describe, expect, test } from "vitest";
import { estadoDeTasa } from "./estadoTasa";

const hoy = new Date("2026-10-15T00:00:00Z");

describe("estadoDeTasa", () => {
  test("la tasa de hoy está al día", () => {
    expect(estadoDeTasa(new Date("2026-10-15T00:00:00Z"), hoy)).toBe("AL_DIA");
  });
  test("una tasa publicada para mañana también está al día", () => {
    expect(estadoDeTasa(new Date("2026-10-16T00:00:00Z"), hoy)).toBe("AL_DIA");
  });
  test("la de ayer está desactualizada", () => {
    expect(estadoDeTasa(new Date("2026-10-14T00:00:00Z"), hoy)).toBe("DESACTUALIZADA");
  });
});
